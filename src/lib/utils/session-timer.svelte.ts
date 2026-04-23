/**
 * Session inactivity timer.
 *
 * Singleton module that tracks user activity and counts down toward automatic
 * logout.  Consumers call `start(minutes)`, then observe `phase` and
 * `secondsRemaining` reactively (Svelte 5 runes).
 *
 * Phases: active -> warning -> urgent -> expired
 */

import { goto } from '$app/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 'active' | 'warning' | 'urgent' | 'expired';

export interface SessionTimerState {
	phase: Phase;
	secondsRemaining: number;
}

// ---------------------------------------------------------------------------
// Internal state (module-scoped — effectively singleton)
// ---------------------------------------------------------------------------

let phase: Phase = $state('active');
let secondsRemaining: number = $state(0);
let timeoutSeconds: number = 0;
let lastActivityTime: number = 0;
let lastResetTime: number = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// Thresholds
let warningThreshold: number = 0;
let urgentThreshold: number = 0;

const ACTIVITY_DEBOUNCE_MS = 5000;

// Bound handler references (needed for proper removal)
const activityHandler = () => debouncedReset();
const visibilityHandler = () => handleVisibilityChange();
const beforeUnloadHandler = () => {
	navigator.sendBeacon('/api/logout');
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeThresholds(secs: number) {
	warningThreshold = Math.max(30, Math.min(secs - 120, secs * 0.6));
	urgentThreshold = Math.min(30, secs * 0.1);
}

function updatePhase() {
	if (secondsRemaining <= 0) {
		phase = 'expired';
	} else if (secondsRemaining <= urgentThreshold) {
		phase = 'urgent';
	} else if (secondsRemaining <= warningThreshold) {
		phase = 'warning';
	} else {
		phase = 'active';
	}
}

function handleExpired() {
	stop();

	phase = 'expired';
	secondsRemaining = 0;

	fetch('/api/logout', { method: 'POST' }).finally(() => {
		goto('/login?reason=expired');
	});
}

function handleVisibilityChange() {
	if (document.visibilityState !== 'visible' || !isRunning) return;

	const elapsedMs = Date.now() - lastActivityTime;
	const elapsedSecs = elapsedMs / 1000;

	if (elapsedSecs >= timeoutSeconds) {
		handleExpired();
	}
}

function debouncedReset() {
	const now = Date.now();
	// Only reset if at least 5 seconds have passed since the last reset
	if (now - lastResetTime < ACTIVITY_DEBOUNCE_MS) return;

	lastResetTime = now;
	secondsRemaining = timeoutSeconds;
	lastActivityTime = now;
	updatePhase();
}

// ---------------------------------------------------------------------------
// Listener registration
// ---------------------------------------------------------------------------

function addListeners() {
	const events = ['mousemove', 'keydown', 'click', 'scroll'] as const;
	for (const event of events) {
		document.addEventListener(event, activityHandler, { passive: true });
	}
	document.addEventListener('visibilitychange', visibilityHandler);
	addEventListener('beforeunload', beforeUnloadHandler);
}

function removeListeners() {
	const events = ['mousemove', 'keydown', 'click', 'scroll'] as const;
	for (const event of events) {
		document.removeEventListener(event, activityHandler);
	}
	document.removeEventListener('visibilitychange', visibilityHandler);
	removeEventListener('beforeunload', beforeUnloadHandler);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

function tick() {
	if (!isRunning) return;

	secondsRemaining = Math.max(0, secondsRemaining - 1);
	updatePhase();

	if (phase === 'expired') {
		handleExpired();
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function start(timeoutMinutes: number) {
	const minutes = Math.max(1, Math.round(timeoutMinutes));

	// Clean up any previous session first
	stop();
	removeListeners();

	timeoutSeconds = minutes * 60;
	secondsRemaining = timeoutSeconds;
	phase = 'active';
	lastActivityTime = Date.now();
	lastResetTime = 0;

	computeThresholds(timeoutSeconds);
	addListeners();

	isRunning = true;
	intervalId = setInterval(tick, 1000);
}

function reset() {
	if (!isRunning || timeoutSeconds === 0) return;

	secondsRemaining = timeoutSeconds;
	phase = 'active';
	lastActivityTime = Date.now();
	lastResetTime = 0;
}

function stop() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
	isRunning = false;
}

function destroy() {
	stop();
	removeListeners();

	secondsRemaining = 0;
	phase = 'active';
	timeoutSeconds = 0;
	lastActivityTime = 0;
	lastResetTime = 0;
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
	reset,
	stop,
	destroy
} as const;
