/**
 * Session inactivity timer (reliable single-timeout design).
 *
 * Architecture (openspec/changes/session-timer-reliability):
 * - ONE expiry `setTimeout` scheduled from `lastActivityAt + timeoutMs`.
 *   Any activity or timeout-config change recomputes the remaining delay
 *   and reschedules. The exactly-one-timeout invariant kills the
 *   double-fire / never-fire bug class of the old interval-countdown design.
 * - Activity = `pointerdown` + `keydown` ONLY. Mousemove/scroll were too
 *   weak (false positives on reading-only sessions); form posts are
 *   deliberately NOT activity (see below). Listener work is throttled, but
 *   the timestamp is always recorded so the armed deadline self-corrects
 *   when the throttle skipped a reschedule.
 * - In-flight post guard: while running, the global `fetch` is wrapped so
 *   every non-GET/HEAD request increments a counter (`use:enhance` submits
 *   through the global fetch, so all SvelteKit form posts are covered).
 *   While the counter > 0, expiry is DEFERRED (not cancelled) and fires
 *   once the last post settles if the deadline has passed. Posts never
 *   extend the session: only real pointer/keyboard interaction does.
 *   This targets "logged out while clicking budget filters" — an in-flight
 *   submission is never destroyed by a logout race, but a truly idle
 *   session still dies on schedule.
 * - Multi-tab (best-effort): activity is broadcast via a localStorage
 *   heartbeat that other tabs observe through the `storage` event.
 *   Documented limitation: tabs in private mode / hardened profiles with
 *   localStorage disabled or blocked do not sync and may expire
 *   independently.
 * - Server relationship: this timer is the UX WARNING. The server enforces
 *   its own expiry (24h inactivity, `src/hooks.server.ts`) — a server-side
 *   kill redirects to /login with `reason` + `redirectTo` instead of a
 *   silent redirect.
 *
 * Phases: active -> warning -> urgent -> expired
 */

import { goto } from "$app/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = "active" | "warning" | "urgent" | "expired";

// ---------------------------------------------------------------------------
// Internal state (module-scoped — effectively singleton)
// ---------------------------------------------------------------------------

let phase: Phase = $state("active");
let secondsRemaining: number = $state(0);

let isRunning = false;
let hasFired = false;
let timeoutMs = 0;
let lastActivityAt = 0;
let lastRescheduleAt = 0;

let expiryTimeout: ReturnType<typeof setTimeout> | null = null;
let uiInterval: ReturnType<typeof setInterval> | null = null;

let inflightPosts = 0;
let expiryDeferred = false;

let warningThreshold = 0;
let urgentThreshold = 0;

const RESCHEDULE_THROTTLE_MS = 5000;
const ACTIVITY_STORAGE_KEY = "offline-finance:session-activity";
const ACTIVITY_EVENTS = ["pointerdown", "keydown"] as const;

// fetch-wrapper bookkeeping
let fetchPatched = false;
let originalFetch: typeof globalThis.fetch | null = null;

// NOTE: No logout beacon on beforeunload/pagehide.
// beforeunload also fires on ordinary page refreshes, so a beacon races the
// reload and non-deterministically logs the user out. Session invalidation is
// owned by the server (24h inactivity expiry) plus this client timer.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deadline(): number {
	return lastActivityAt + timeoutMs;
}

function computeThresholds(secs: number) {
	warningThreshold = Math.max(30, Math.min(secs - 120, secs * 0.6));
	urgentThreshold = Math.min(30, secs * 0.1);
}

function syncUi() {
	if (!isRunning) return;
	const remainingMs = deadline() - Date.now();
	secondsRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
	if (secondsRemaining <= urgentThreshold) {
		phase = "urgent";
	} else if (secondsRemaining <= warningThreshold) {
		phase = "warning";
	} else {
		phase = "active";
	}
}

function armTimeout(delayMs: number) {
	if (expiryTimeout !== null) {
		clearTimeout(expiryTimeout);
	}
	expiryTimeout = null;
	if (!isRunning) return;
	expiryTimeout = setTimeout(handleDeadline, delayMs);
}

function reschedule() {
	lastRescheduleAt = Date.now();
	const remaining = deadline() - Date.now();
	armTimeout(Math.max(0, remaining));
}

/**
 * The single armed expiry timeout. Self-corrects when activity has pushed
 * the deadline out since it was armed, defers while posts are in flight,
 * and otherwise fires expiry exactly once.
 */
function handleDeadline() {
	expiryTimeout = null;
	if (!isRunning || hasFired) return;

	const remaining = deadline() - Date.now();
	if (remaining > 0) {
		// Activity happened after this timeout was armed (throttled
		// reschedule skipped it) — re-arm to the true deadline.
		armTimeout(remaining);
		return;
	}

	if (inflightPosts > 0) {
		// Deadline passed mid-post: defer (never cancel) until posts settle.
		expiryDeferred = true;
		return;
	}

	fireExpiry();
}

function expiryRedirectTarget(): string {
	if (typeof location === "undefined") return "/login?reason=expired";
	const current = location.pathname + location.search;
	return `/login?reason=expired&redirectTo=${encodeURIComponent(current)}`;
}

function fireExpiry() {
	if (hasFired) return;
	hasFired = true;
	expiryDeferred = false;

	teardownTimers();
	removeListeners();

	phase = "expired";
	secondsRemaining = 0;

	// Use the unwrapped fetch so the logout post never counts against the
	// in-flight guard.
	const fetchImpl = originalFetch ?? globalThis.fetch;
	fetchImpl
		.call(globalThis, "/api/logout", { method: "POST" })
		.catch(() => {})
		.finally(() => {
			goto(expiryRedirectTarget());
		});
}

// ---------------------------------------------------------------------------
// Activity detection
// ---------------------------------------------------------------------------

function onActivity() {
	if (!isRunning || hasFired) return;
	const now = Date.now();
	// Always record the timestamp (cheap) so handleDeadline self-corrects
	// even when the throttled reschedule below is skipped.
	lastActivityAt = now;
	syncUi();
	if (now - lastRescheduleAt >= RESCHEDULE_THROTTLE_MS) {
		lastRescheduleAt = now;
		broadcastActivity(now);
		reschedule();
	}
}

function broadcastActivity(at: number) {
	if (typeof localStorage === "undefined") return;
	try {
		// storage event fires in OTHER tabs only — that is exactly the
		// multi-tab broadcast we want.
		localStorage.setItem(ACTIVITY_STORAGE_KEY, String(at));
	} catch {
		// Best-effort multi-tab sync; private mode can throw.
	}
}

function onStorage(event: StorageEvent) {
	if (event.key !== ACTIVITY_STORAGE_KEY) return;
	const remote = Number(event.newValue);
	if (!Number.isFinite(remote)) return;
	if (!isRunning || hasFired) return;
	if (remote > lastActivityAt) {
		lastActivityAt = remote;
		reschedule();
		syncUi();
	}
}

function onVisibilityChange() {
	if (typeof document === "undefined") return;
	if (document.visibilityState !== "visible") return;
	if (!isRunning || hasFired) return;
	// Background-tab timer throttling may have delayed the deadline
	// callback — resync against wall-clock on focus.
	if (Date.now() >= deadline() && inflightPosts === 0) {
		fireExpiry();
	} else {
		reschedule();
	}
	syncUi();
}

// ---------------------------------------------------------------------------
// In-flight post guard (global fetch wrapper)
// ---------------------------------------------------------------------------

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
	if (init?.method) return String(init.method).toUpperCase();
	if (typeof Request !== "undefined" && input instanceof Request) {
		return input.method.toUpperCase();
	}
	return "GET";
}

function installFetchWrapper() {
	if (fetchPatched) return;
	// Keep the original reference (no .bind) so destroy() restores the
	// exact same object; invoke with globalThis as the receiver.
	const of = globalThis.fetch;
	originalFetch = of;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const method = requestMethod(input, init);
		if (!isRunning || method === "GET" || method === "HEAD") {
			return of.call(globalThis, input, init);
		}
		inflightPosts++;
		try {
			return await of.call(globalThis, input, init);
		} finally {
			inflightPosts = Math.max(0, inflightPosts - 1);
			onPostSettled();
		}
	}) as typeof globalThis.fetch;
	fetchPatched = true;
}

function onPostSettled() {
	if (!expiryDeferred || hasFired || !isRunning) return;
	if (inflightPosts > 0) return;
	expiryDeferred = false;
	const remaining = deadline() - Date.now();
	if (remaining <= 0) {
		// Deadline passed while deferred — fire now that posts settled.
		fireExpiry();
	} else {
		// Activity pushed the deadline out while posts were deferred.
		armTimeout(remaining);
	}
}

function restoreFetch() {
	if (!fetchPatched || !originalFetch) return;
	globalThis.fetch = originalFetch;
	originalFetch = null;
	fetchPatched = false;
}

// ---------------------------------------------------------------------------
// Listener registration
// ---------------------------------------------------------------------------

function addListeners() {
	if (typeof document === "undefined") return;
	for (const event of ACTIVITY_EVENTS) {
		document.addEventListener(event, onActivity, {
			passive: true,
			capture: true,
		});
	}
	document.addEventListener("visibilitychange", onVisibilityChange);
	if (typeof window !== "undefined") {
		window.addEventListener("storage", onStorage);
	}
}

function removeListeners() {
	if (typeof document === "undefined") return;
	for (const event of ACTIVITY_EVENTS) {
		document.removeEventListener(event, onActivity, { capture: true });
	}
	document.removeEventListener("visibilitychange", onVisibilityChange);
	if (typeof window !== "undefined") {
		window.removeEventListener("storage", onStorage);
	}
}

// ---------------------------------------------------------------------------
// Timer lifecycle
// ---------------------------------------------------------------------------

function teardownTimers() {
	if (expiryTimeout !== null) {
		clearTimeout(expiryTimeout);
		expiryTimeout = null;
	}
	if (uiInterval !== null) {
		clearInterval(uiInterval);
		uiInterval = null;
	}
}

function startUiTick() {
	if (uiInterval !== null) return;
	// Presentational only: drives phase/secondsRemaining for the banner.
	// Expiry authority is the single expiryTimeout.
	uiInterval = setInterval(syncUi, 1000);
}

function start(timeoutMinutes: number) {
	const minutes = Math.max(1, Math.round(timeoutMinutes));

	teardownTimers();
	removeListeners();

	isRunning = true;
	hasFired = false;
	expiryDeferred = false;
	inflightPosts = 0;
	timeoutMs = minutes * 60_000;
	lastActivityAt = Date.now();
	lastRescheduleAt = lastActivityAt;

	computeThresholds(minutes * 60);
	phase = "active";
	secondsRemaining = minutes * 60;

	addListeners();
	installFetchWrapper();
	reschedule();
	startUiTick();
}

/**
 * Idempotent start for the root layout effect: re-arms only when the
 * timeout setting actually changed. Re-running the effect with the same
 * value (e.g. after invalidateAll refreshes page.data) must NOT extend
 * the session — that was the old design's never-fire bug.
 */
function ensureStarted(timeoutMinutes: number) {
	const minutes = Math.max(1, Math.round(timeoutMinutes));
	if (isRunning && timeoutMs === minutes * 60_000) return;
	start(minutes);
}

function reset() {
	if (!isRunning || hasFired) return;
	lastActivityAt = Date.now();
	reschedule();
	syncUi();
}

function stop() {
	teardownTimers();
	isRunning = false;
}

function destroy() {
	stop();
	removeListeners();
	restoreFetch();

	secondsRemaining = 0;
	phase = "active";
	timeoutMs = 0;
	lastActivityAt = 0;
	lastRescheduleAt = 0;
	inflightPosts = 0;
	expiryDeferred = false;
	hasFired = false;
	warningThreshold = 0;
	urgentThreshold = 0;
}

// ---------------------------------------------------------------------------
// Exported singleton (getter functions for reactive access)
// ---------------------------------------------------------------------------

export const sessionTimer = {
	get phase(): Phase {
		return phase;
	},
	get secondsRemaining(): number {
		return secondsRemaining;
	},
	start,
	ensureStarted,
	reset,
	stop,
	destroy,
} as const;
