import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Route-harness mocks — simulate the browser environment the layout wires
// the timer into: document events, window storage events, localStorage,
// location, and the global fetch that `use:enhance` form posts travel on.
// ---------------------------------------------------------------------------

vi.mock("$app/navigation", () => ({
	goto: vi.fn(),
	afterNavigate: vi.fn(),
}));

const eventListeners: Record<string, Array<(event?: unknown) => void>> = {};

function makeListenerTarget(): Record<string, unknown> {
	return {
		addEventListener: vi.fn(
			(event: string, handler: (event?: unknown) => void) => {
				eventListeners[event] = eventListeners[event] || [];
				eventListeners[event].push(handler);
			},
		),
		removeEventListener: vi.fn((event: string, handler: () => void) => {
			eventListeners[event] = (eventListeners[event] || []).filter(
				(h) => h !== handler,
			);
		}),
	};
}

Object.defineProperty(globalThis, "document", {
	value: { visibilityState: "visible", ...makeListenerTarget() },
	writable: true,
	configurable: true,
});

// window mock (storage events land here)
Object.defineProperty(globalThis, "window", {
	value: makeListenerTarget(),
	writable: true,
	configurable: true,
});

// location mock — expiry redirect must preserve it as redirectTo
Object.defineProperty(globalThis, "location", {
	value: {
		pathname: "/overview/budgets/2026-10",
		search: "?tab=x",
	},
	writable: true,
	configurable: true,
});

// localStorage mock (multi-tab heartbeat channel)
const storageMap = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	value: {
		setItem: vi.fn((k: string, v: string) => storageMap.set(k, v)),
		getItem: vi.fn((k: string) => storageMap.get(k) ?? null),
		removeItem: vi.fn((k: string) => storageMap.delete(k)),
	},
	writable: true,
	configurable: true,
});

// Base fetch mock — the module wraps globalThis.fetch on start() and
// restores it on destroy(). Hold the base reference: while a timer runs,
// globalThis.fetch IS the wrapper, not this mock.
const baseFetch = vi.fn().mockResolvedValue({ ok: true });
globalThis.fetch = baseFetch;

// ---------------------------------------------------------------------------
// Import modules under test
// ---------------------------------------------------------------------------

import { sanitizeRedirectTo } from "$lib/utils/redirect-to";
import { sessionTimer } from "$lib/utils/session-timer.svelte";

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

function dispatchDocumentEvent(event: string) {
	for (const handler of eventListeners[event] ?? []) handler();
}

function dispatchStorageEvent(key: string, newValue: string | null) {
	for (const handler of eventListeners.storage ?? [])
		handler({ key, newValue });
}

/** Base (pre-wrapper) fetch mock — configure and assert on THIS. */
function originalFetchMock() {
	return baseFetch;
}

// ---------------------------------------------------------------------------

describe("session-timer integration (fake timers + route harness)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		sessionTimer.destroy();
		originalFetchMock().mockReset();
		originalFetchMock().mockResolvedValue({ ok: true });
		vi.clearAllMocks();
		storageMap.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		sessionTimer.destroy();
	});

	// -- Failure mode 1: idle expiry fires exactly once ----------------------

	it("idle beyond the timeout fires expiry exactly once, never double-fires", async () => {
		sessionTimer.start(1); // 60s

		vi.advanceTimersByTime(60_000);
		expect(sessionTimer.phase).toBe("expired");

		// ...and stays fired exactly once however long the tab sits afterwards
		vi.advanceTimersByTime(3_600_000);
		expect(originalFetchMock()).toHaveBeenCalledTimes(1);
		expect(originalFetchMock()).toHaveBeenCalledWith("/api/logout", {
			method: "POST",
		});

		await vi.advanceTimersByTimeAsync(0);
		const { goto } = await import("$app/navigation");
		expect(goto).toHaveBeenCalledTimes(1);
	});

	it("expiry preserves the current URL as redirectTo", async () => {
		sessionTimer.start(1);

		vi.advanceTimersByTime(60_000);
		await vi.advanceTimersByTimeAsync(0);

		const { goto } = await import("$app/navigation");
		expect(goto).toHaveBeenCalledWith(
			"/login?reason=expired&redirectTo=%2Foverview%2Fbudgets%2F2026-10%3Ftab%3Dx",
		);
	});

	// -- Failure mode 2: timeout-change re-arm (audit qa-findings/03 #2/#3) --

	it("changing the timeout mid-session re-arms to the new deadline", () => {
		sessionTimer.ensureStarted(1); // layout starts timer with 1 minute

		vi.advanceTimersByTime(30_000);

		// Settings saved + invalidateAll delivers the new value → effect re-runs
		sessionTimer.ensureStarted(5); // now 5 minutes, re-armed from now

		// Old deadline (t=60s) must NOT fire
		vi.advanceTimersByTime(30_000);
		expect(sessionTimer.phase).not.toBe("expired");
		expect(originalFetchMock()).not.toHaveBeenCalled();

		// New deadline: 30s + 300s = t=330s
		vi.advanceTimersByTime(270_000);
		expect(sessionTimer.phase).toBe("expired");
		expect(originalFetchMock()).toHaveBeenCalledTimes(1);
	});

	it("re-running the layout effect with the SAME timeout never extends the session", () => {
		sessionTimer.ensureStarted(1);

		vi.advanceTimersByTime(50_000);

		// invalidateAll refreshes page.data — same inactivityTimeout value.
		// This was the audit's never-fire class: start() on every effect
		// re-run kept pushing the deadline out.
		sessionTimer.ensureStarted(1);
		sessionTimer.ensureStarted(1);

		vi.advanceTimersByTime(10_000); // t=60s — original deadline
		expect(sessionTimer.phase).toBe("expired");
		expect(originalFetchMock()).toHaveBeenCalledTimes(1);
	});

	// -- Failure mode 3: expiry never races in-flight form posts -----------

	it("deadline passing mid-post defers expiry until the post settles, then fires", async () => {
		sessionTimer.start(1); // deadline t=60s

		// A form post (use:enhance → global fetch) in flight at the deadline
		let settlePost: (value: unknown) => void = () => {};
		originalFetchMock().mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settlePost = resolve;
				}),
		);
		const postPromise = globalThis.fetch("/overview/budgets?/toggleCategory", {
			method: "POST",
		});

		vi.advanceTimersByTime(60_000); // deadline passes mid-post
		expect(sessionTimer.phase).not.toBe("expired");
		expect(originalFetchMock()).not.toHaveBeenCalledWith("/api/logout", {
			method: "POST",
		});

		settlePost({ ok: true });
		await postPromise;
		await vi.advanceTimersByTimeAsync(0);

		// Post settled, deadline still passed → expiry fires
		expect(sessionTimer.phase).toBe("expired");
		expect(originalFetchMock()).toHaveBeenCalledWith("/api/logout", {
			method: "POST",
		});
	});

	it("activity during a deferred post wins — expiry re-arms instead of firing", async () => {
		sessionTimer.start(1);

		let settlePost: (value: unknown) => void = () => {};
		originalFetchMock().mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settlePost = resolve;
				}),
		);
		const postPromise = globalThis.fetch("/x", { method: "POST" });

		vi.advanceTimersByTime(60_000); // deferred
		dispatchDocumentEvent("pointerdown"); // real user interaction at t=60s

		settlePost({ ok: true });
		await postPromise;
		await vi.advanceTimersByTimeAsync(0);

		expect(sessionTimer.phase).not.toBe("expired"); // deadline moved to t=120s

		vi.advanceTimersByTime(60_000);
		expect(sessionTimer.phase).toBe("expired");
	});

	it("posts do NOT extend the session — only pointer/keyboard activity does", async () => {
		sessionTimer.start(1);

		// Completing posts right up to the deadline without any interaction
		vi.advanceTimersByTime(50_000);
		await globalThis.fetch("/x", { method: "POST" }); // settles at t=50s

		await vi.advanceTimersByTimeAsync(10_000); // t=60s — original deadline stands
		expect(sessionTimer.phase).toBe("expired");
	});

	// -- Activity detection ---------------------------------------------------

	it("pointerdown and keydown push the deadline out", () => {
		sessionTimer.start(5); // deadline t=300s

		vi.advanceTimersByTime(290_000);
		dispatchDocumentEvent("pointerdown"); // activity at t=290s

		vi.advanceTimersByTime(15_000); // t=305s — old deadline passed...
		expect(sessionTimer.phase).not.toBe("expired"); // ...but re-armed to t=590s

		vi.advanceTimersByTime(285_000); // t=590s
		expect(sessionTimer.phase).toBe("expired");
	});

	it("mousemove/scroll are no longer tracked (reading sessions expire on schedule)", () => {
		sessionTimer.start(1);

		vi.advanceTimersByTime(30_000);
		dispatchDocumentEvent("mousemove"); // not registered — ignored
		dispatchDocumentEvent("scroll");

		vi.advanceTimersByTime(30_000); // t=60s
		expect(sessionTimer.phase).toBe("expired");
	});

	// -- Multi-tab best-effort ------------------------------------------------

	it("storage broadcast from another tab pushes the local deadline", () => {
		sessionTimer.start(1);

		vi.advanceTimersByTime(30_000);
		// Another tab's heartbeat — epoch-ms scale, like real broadcasts
		dispatchStorageEvent(
			"offline-finance:session-activity",
			String(Date.now()),
		);

		vi.advanceTimersByTime(30_000); // t=60s — old local deadline
		expect(sessionTimer.phase).not.toBe("expired"); // remote activity won

		vi.advanceTimersByTime(30_000); // t=90s = remote activity + 60s
		expect(sessionTimer.phase).toBe("expired");
	});

	it("unrelated storage keys are ignored", () => {
		sessionTimer.start(1);

		vi.advanceTimersByTime(30_000);
		dispatchStorageEvent("some-other-key", "9999999999999");

		vi.advanceTimersByTime(30_000); // t=60s
		expect(sessionTimer.phase).toBe("expired");
	});
});

describe("sanitizeRedirectTo", () => {
	it("accepts same-origin app paths with queries", () => {
		expect(sanitizeRedirectTo("/overview/budgets/2026-10?tab=x")).toBe(
			"/overview/budgets/2026-10?tab=x",
		);
	});

	it("rejects absent values", () => {
		expect(sanitizeRedirectTo(null)).toBeNull();
		expect(sanitizeRedirectTo("")).toBeNull();
		expect(sanitizeRedirectTo(undefined)).toBeNull();
	});

	it("rejects absolute and protocol-relative URLs (open redirect)", () => {
		expect(sanitizeRedirectTo("https://evil.example")).toBeNull();
		expect(sanitizeRedirectTo("//evil.example")).toBeNull();
		expect(sanitizeRedirectTo("/\\evil.example")).toBeNull();
	});

	it("rejects auth routes (login loops)", () => {
		expect(sanitizeRedirectTo("/login")).toBeNull();
		expect(sanitizeRedirectTo("/login?reason=expired")).toBeNull();
		expect(sanitizeRedirectTo("/register")).toBeNull();
	});

	it("rejects ceremony/bounce routes (no chained ceremonies)", () => {
		expect(sanitizeRedirectTo("/unlock")).toBeNull();
		expect(sanitizeRedirectTo("/unlock?reason=sealed&device=1")).toBeNull();
		expect(sanitizeRedirectTo("/logout")).toBeNull();
		expect(sanitizeRedirectTo("/recovery-enroll")).toBeNull();
		expect(sanitizeRedirectTo("/recovery-enroll?mode=register")).toBeNull();
		expect(sanitizeRedirectTo("/migrate")).toBeNull();
		// Similar-but-different app paths stay allowed
		expect(sanitizeRedirectTo("/overview/unlocking-guide")).toBe(
			"/overview/unlocking-guide",
		);
		expect(sanitizeRedirectTo("/tools/migration-helper")).toBe(
			"/tools/migration-helper",
		);
	});

	it("rejects header-injection characters", () => {
		expect(sanitizeRedirectTo("/ok\r\nSet-Cookie: x=1")).toBeNull();
		expect(sanitizeRedirectTo("/ok\nX: y")).toBeNull();
	});
});
