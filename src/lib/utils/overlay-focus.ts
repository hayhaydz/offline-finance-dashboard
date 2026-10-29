// src/lib/utils/overlay-focus.ts

/**
 * Focus management for overlay dialogs (Phase 9 a11y polish).
 *
 * Two WCAG dialog obligations the app's overlays were missing:
 *  1. move focus INTO the dialog when it opens (keyboard users aren't
 *     stranded behind the backdrop)
 *  2. return focus to the triggering element when it closes
 *
 * captureFocus() snapshots document.activeElement at open time and
 * returns a restore function; restore is a no-op if the element left
 * the DOM meanwhile (invalidateAll remounts are common here).
 */

export function captureFocus(): () => void {
	const el =
		typeof document !== "undefined" &&
		document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;
	return () => {
		if (el && el.isConnected) el.focus();
	};
}
