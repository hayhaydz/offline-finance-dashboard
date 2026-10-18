import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE the module under test is imported
// ---------------------------------------------------------------------------

vi.mock("$app/navigation", () => ({
	goto: vi.fn(),
	afterNavigate: vi.fn(),
}));

// Mock browser globals that the session-timer references at module level
const eventListeners: Record<string, Array<() => void>> = {};

Object.defineProperty(globalThis, "document", {
	value: {
		addEventListener: vi.fn(
			(event: string, handler: () => void, _options?: unknown) => {
				eventListeners[event] = eventListeners[event] || [];
				eventListeners[event].push(handler);
			},
		),
		removeEventListener: vi.fn((event: string, handler: () => void) => {
			eventListeners[event] = (eventListeners[event] || []).filter(
				(h) => h !== handler,
			);
		}),
		visibilityState: "visible",
	},
	writable: true,
	configurable: true,
});

// Mock fetch — wrapped by the module's in-flight guard while running, and
// called by fireExpiry() through the unwrapped original. Hold the base
// reference for assertions: globalThis.fetch becomes the wrapper mid-test.
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
globalThis.fetch = fetchMock;

// ---------------------------------------------------------------------------
// Import module under test (compiled via sveltekit plugin for .svelte.ts)
// ---------------------------------------------------------------------------

import { sessionTimer } from "$lib/utils/session-timer.svelte";

// ---------------------------------------------------------------------------

describe("sessionTimer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		sessionTimer.destroy();
		// Reset mocks
		fetchMock.mockClear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		sessionTimer.destroy();
	});

	it("start() initializes correctly with 5-minute timeout", () => {
		sessionTimer.start(5);

		expect(sessionTimer.phase).toBe("active");
		expect(sessionTimer.secondsRemaining).toBe(300);
	});

	it("destroy() resets all state to defaults", () => {
		sessionTimer.start(5);
		expect(sessionTimer.secondsRemaining).toBe(300);

		sessionTimer.destroy();

		expect(sessionTimer.phase).toBe("active");
		expect(sessionTimer.secondsRemaining).toBe(0);
	});

	it("reset() resets countdown to original timeout", () => {
		sessionTimer.start(5);
		expect(sessionTimer.secondsRemaining).toBe(300);

		// Advance 2 seconds
		vi.advanceTimersByTime(2000);
		expect(sessionTimer.secondsRemaining).toBe(298);

		sessionTimer.reset();

		expect(sessionTimer.secondsRemaining).toBe(300);
		expect(sessionTimer.phase).toBe("active");
	});

	it("start() clamps invalid values to minimum 1 minute", () => {
		// 0 minutes → clamped to 1
		sessionTimer.start(0);
		expect(sessionTimer.secondsRemaining).toBe(60);

		sessionTimer.destroy();

		// Negative → clamped to 1
		sessionTimer.start(-5);
		expect(sessionTimer.secondsRemaining).toBe(60);
	});

	it("start() rounds fractional values", () => {
		sessionTimer.start(5.7);
		// Math.round(5.7) = 6, so 6 * 60 = 360
		expect(sessionTimer.secondsRemaining).toBe(360);
	});

	it("countdown ticks correctly each second", () => {
		sessionTimer.start(1); // 60 seconds
		expect(sessionTimer.secondsRemaining).toBe(60);

		// Advance 1 second — UI tick recomputes from the deadline
		vi.advanceTimersByTime(1000);
		expect(sessionTimer.secondsRemaining).toBe(59);

		vi.advanceTimersByTime(1000);
		expect(sessionTimer.secondsRemaining).toBe(58);

		vi.advanceTimersByTime(1000);
		expect(sessionTimer.secondsRemaining).toBe(57);
	});

	it("phase transitions for 5-minute timeout", () => {
		// Thresholds for 300s:
		//   warning  = Math.max(30, Math.min(180, 180)) = 180
		//   urgent   = Math.min(30, 30)                  = 30
		sessionTimer.start(5);

		// Advance to 120s remaining (180s elapsed)
		vi.advanceTimersByTime(180_000);
		expect(sessionTimer.secondsRemaining).toBe(120);
		expect(sessionTimer.phase).toBe("warning"); // 120 <= 180

		// Advance to 25s remaining (another 95s)
		vi.advanceTimersByTime(95_000);
		expect(sessionTimer.secondsRemaining).toBe(25);
		expect(sessionTimer.phase).toBe("urgent"); // 25 <= 30

		// Advance to expiry (another 25s)
		vi.advanceTimersByTime(25_000);
		expect(sessionTimer.secondsRemaining).toBe(0);
		expect(sessionTimer.phase).toBe("expired");
	});

	it("phase transitions for 1-minute timeout", () => {
		// Thresholds for 60s:
		//   warning  = Math.max(30, Math.min(-60, 36)) = 30
		//   urgent   = Math.min(30, 6)                   = 6
		sessionTimer.start(1);

		// Advance to 25s remaining (35s elapsed)
		vi.advanceTimersByTime(35_000);
		expect(sessionTimer.secondsRemaining).toBe(25);
		expect(sessionTimer.phase).toBe("warning"); // 25 <= 30

		// Advance to 5s remaining (another 20s)
		vi.advanceTimersByTime(20_000);
		expect(sessionTimer.secondsRemaining).toBe(5);
		expect(sessionTimer.phase).toBe("urgent"); // 5 <= 6

		// Advance to expiry (another 5s)
		vi.advanceTimersByTime(5_000);
		expect(sessionTimer.secondsRemaining).toBe(0);
		expect(sessionTimer.phase).toBe("expired");
	});

	it("stop() pauses countdown", () => {
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

	it("multiple start() calls are safe — last call wins", () => {
		sessionTimer.start(5);
		expect(sessionTimer.secondsRemaining).toBe(300);

		sessionTimer.start(10);
		expect(sessionTimer.secondsRemaining).toBe(600);
	});

	it("reset() is a no-op when timer is not running", () => {
		// Don't call start() — timer is not running
		sessionTimer.reset();
		expect(sessionTimer.secondsRemaining).toBe(0);
		expect(sessionTimer.phase).toBe("active");
	});

	it("calls fetch and goto on expiry", async () => {
		sessionTimer.start(1); // 60 seconds

		// Advance to expiry
		vi.advanceTimersByTime(60_000);
		expect(sessionTimer.phase).toBe("expired");

		// fireExpiry calls fetch('/api/logout') and goto('/login?reason=expired')
		expect(fetchMock).toHaveBeenCalledWith("/api/logout", {
			method: "POST",
		});

		// Allow the .finally() microtask to resolve
		await vi.advanceTimersByTimeAsync(0);

		const { goto } = await import("$app/navigation");
		expect(goto).toHaveBeenCalledWith("/login?reason=expired");
	});

	it("expiry fires exactly once — advancing well past the deadline does not re-fire", async () => {
		sessionTimer.start(1);

		vi.advanceTimersByTime(60_000);
		vi.advanceTimersByTime(600_000);

		expect(fetchMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(0);
		const { goto } = await import("$app/navigation");
		expect(goto).toHaveBeenCalledTimes(1);
	});
});
