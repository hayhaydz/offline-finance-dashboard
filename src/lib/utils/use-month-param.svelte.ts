import { goto } from "$app/navigation";
import { page as pageState } from "$app/state";

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Svelte 5 composable for URL-synced month-keyed pagination (`?month=YYYY-MM`).
 *
 * One ledger page = one calendar month. A null month means "default"
 * (latest data-bearing month, server-decided) and removes the URL param.
 * Invalid `YYYY-MM` values are treated as absent.
 *
 * Mirrors the guards of `useUrlPagination`: re-entrancy latch plus
 * replaceState/noScroll navigation so month jumps don't spam history.
 */
export function useMonthParam(paramName: string = "month") {
	let currentMonth = $state<string | null>(null);
	let isUpdating = $state(false);

	// Sync from URL (browser back/forward + direct links)
	$effect(() => {
		if (isUpdating) return;
		const raw = pageState.url.searchParams.get(paramName);
		currentMonth = raw !== null && MONTH_KEY_PATTERN.test(raw) ? raw : null;
	});

	async function updateMonth(monthKey: string | null) {
		if (isUpdating) return;
		if (monthKey !== null && !MONTH_KEY_PATTERN.test(monthKey)) return;
		isUpdating = true;
		currentMonth = monthKey;
		const url = new URL(pageState.url);
		if (monthKey !== null) {
			url.searchParams.set(paramName, monthKey);
		} else {
			url.searchParams.delete(paramName);
		}
		await goto(url.pathname + url.search, {
			replaceState: true,
			noScroll: true,
			keepFocus: true,
		});
		isUpdating = false;
	}

	return {
		get month() {
			return currentMonth;
		},
		set month(v: string | null) {
			currentMonth = v;
		},
		updateMonth,
	};
}
