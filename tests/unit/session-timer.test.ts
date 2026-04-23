import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE the module under test is imported
// ---------------------------------------------------------------------------

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	afterNavigate: vi.fn()
}));

// Mock browser globals that the session-timer references at module level
const eventListeners: Record<string, Function[]> = {};

Object.defineProperty(globalThis, 'document', {
	value: {
		addEventListener: vi.fn((event: string, handler: Function, _options?: unknown) => {
			eventListeners[event] = eventListeners[event] || [];
			eventListeners[event].push(handler);
		}),
		removeEventListener: vi.fn((event: string, handler: Function) => {
			eventListeners[event] = (eventListeners[event] || []).filter(h => h !== handler);
		}),
		visibilityState: 'visible'
	},
	writable: true,
	configurable: true
});

Object.defineProperty(globalThis, 'navigator', {
	value: { sendBeacon: vi.fn() },
	writable: true,
	configurable: true
});

globalThis.addEventListener = vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
	eventListeners[event] = eventListeners[event] || [];
	eventListeners[event].push(handler as Function);
}) as unknown as typeof globalThis.addEventListener;
globalThis.removeEventListener = vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
	eventListeners[event] = (eventListeners[event] || []).filter(h => h !== (handler as Function));
}) as unknown as typeof globalThis.removeEventListener;

// Mock fetch — called by handleExpired() on session expiry
globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

// ---------------------------------------------------------------------------
// Import module under test (compiled via sveltekit plugin for .svelte.ts)
// ---------------------------------------------------------------------------

import { sessionTimer } from '$lib/utils/session-timer.svelte';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionTimer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		sessionTimer.destroy();
		// Reset mocks
		vi.mocked(globalThis.fetch).mockClear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		sessionTimer.destroy();
	});

	// -- Helper: verify timer tick fires the interval callback ----------------
	// `setInterval(fn, 1000)` means advancing by N ms fires ~N ticks.
	// Vitest fake timers fire the callback once per `advanceTimersByTime(1000)`.

	it('start() initializes correctly with 5-minute timeout', () => {
		sessionTimer.start(5);

		expect(sessionTimer.phase).toBe('active');
		expect(sessionTimer.secondsRemaining).toBe(300);
	});

	it('destroy() resets all state to defaults', () => {
		sessionTimer.start(5);
		expect(sessionTimer.secondsRemaining).toBe(300);

		sessionTimer.destroy();

		expect(sessionTimer.phase).toBe('active');
		expect(sessionTimer.secondsRemaining).toBe(0);
	});

	it('reset() resets countdown to original timeout', () => {
		sessionTimer.start(5);
		expect(sessionTimer.secondsRemaining).toBe(300);

		// Advance 2 seconds
		vi.advanceTimersByTime(2000);
		expect(sessionTimer.secondsRemaining).toBe(298);

		sessionTimer.reset();

		expect(sessionTimer.secondsRemaining).toBe(300);
		expect(sessionTimer.phase).toBe('active');
	});

	it('start() clamps invalid values to minimum 1 minute', () => {
		// 0 minutes → clamped to 1
		sessionTimer.start(0);
		expect(sessionTimer.secondsRemaining).toBe(60);

		sessionTimer.destroy();

		// Negative → clamped to 1
		sessionTimer.start(-5);
		expect(sessionTimer.secondsRemaining).toBe(60);
	});

	it('start() rounds fractional values', () => {
		sessionTimer.start(5.7);
		// Math.round(5.7) = 6, so 6 * 60 = 360
		expect(sessionTimer.secondsRemaining).toBe(360);
	});

	it('countdown ticks correctly each second', () => {
		sessionTimer.start(1); // 60 seconds
		expect(sessionTimer.secondsRemaining).toBe(60);

		// Advance 3 seconds — each 1000ms fires one tick
		vi.advanceTimersByTime(1000);
		expect(sessionTimer.secondsRemaining).toBe(59);

		vi.advanceTimersByTime(1000);
		expect(sessionTimer.secondsRemaining).toBe(58);

		vi.advanceTimersByTime(1000);
		expect(sessionTimer.secondsRemaining).toBe(57);
	});

	it('phase transitions for 5-minute timeout', () => {
		// Thresholds for 300s:
		//   warning  = Math.max(30, Math.min(180, 180)) = 180
		//   urgent   = Math.min(30, 30)                  = 30
		sessionTimer.start(5);

		// Advance to 120s remaining (180s elapsed)
		vi.advanceTimersByTime(180_000);
		expect(sessionTimer.secondsRemaining).toBe(120);
		expect(sessionTimer.phase).toBe('warning'); // 120 <= 180

		// Advance to 25s remaining (another 95s)
		vi.advanceTimersByTime(95_000);
		expect(sessionTimer.secondsRemaining).toBe(25);
		expect(sessionTimer.phase).toBe('urgent'); // 25 <= 30

		// Advance to 0s (another 25s)
		vi.advanceTimersByTime(25_000);
		expect(sessionTimer.secondsRemaining).toBe(0);
		expect(sessionTimer.phase).toBe('expired');
	});

	it('phase transitions for 1-minute timeout', () => {
		// Thresholds for 60s:
		//   warning  = Math.max(30, Math.min(-60, 36)) = 30
		//   urgent   = Math.min(30, 6)                   = 6
		sessionTimer.start(1);

		// Advance to 25s remaining (35s elapsed)
		vi.advanceTimersByTime(35_000);
		expect(sessionTimer.secondsRemaining).toBe(25);
		expect(sessionTimer.phase).toBe('warning'); // 25 <= 30

		// Advance to 5s remaining (another 20s)
		vi.advanceTimersByTime(20_000);
		expect(sessionTimer.secondsRemaining).toBe(5);
		expect(sessionTimer.phase).toBe('urgent'); // 5 <= 6

		// Advance to 0s (another 5s)
		vi.advanceTimersByTime(5_000);
		expect(sessionTimer.secondsRemaining).toBe(0);
		expect(sessionTimer.phase).toBe('expired');
	});

	it('stop() pauses countdown', () => {
		sessionTimer.start(5);
		expect(sessionTimer.secondsRemaining).toBe(300);

		// Advance 3 seconds
		vi.advanceTimersByTime(3000);
		expect(sessionTimer.secondsRemaining).toBe(297);

		sessionTimer.stop();

		// Advance another 5 seconds — timer should NOT tick
		vi.advanceTimersByTime(5000);
		expect(sessionTimer.secondsRemaining).toBe(297);
	});

	it('multiple start() calls are safe — last call wins', () => {
		sessionTimer.start(5);
		expect(sessionTimer.secondsRemaining).toBe(300);

		sessionTimer.start(10);
		expect(sessionTimer.secondsRemaining).toBe(600);
	});

	it('reset() is a no-op when timer is not running', () => {
		// Don't call start() — timer is not running
		sessionTimer.reset();
		expect(sessionTimer.secondsRemaining).toBe(0);
		expect(sessionTimer.phase).toBe('active');
	});

	it('calls fetch and goto on expiry', async () => {
		sessionTimer.start(1); // 60 seconds

		// Advance to expiry
		vi.advanceTimersByTime(60_000);
		expect(sessionTimer.phase).toBe('expired');

		// handleExpired calls fetch('/api/logout') and goto('/login?reason=expired')
		expect(globalThis.fetch).toHaveBeenCalledWith('/api/logout', {
			method: 'POST'
		});

		// Allow the .finally() microtask to resolve
		await vi.advanceTimersByTimeAsync(0);

		const { goto } = await import('$app/navigation');
		expect(goto).toHaveBeenCalledWith('/login?reason=expired');
	});
});
