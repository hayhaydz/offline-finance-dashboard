import { goto } from '$app/navigation';
import { page as pageState } from '$app/state';

/**
 * Svelte 5 composable for URL-synced pagination.
 *
 * Internal state is 0-indexed; URL is 1-indexed.
 * Page 1 (internal 0) removes the URL param for clean URLs.
 *
 * Usage:
 *   const { page, updatePage } = useUrlPagination('page');
 *   // For server-data sync, add a separate $effect that sets page directly.
 */
export function useUrlPagination(paramName: string = 'page') {
	let currentPage = $state(0);
	let isUpdating = $state(false);

	// Sync from URL (browser back/forward + direct links)
	$effect(() => {
		if (isUpdating) return;
		const urlPage = Number(pageState.url.searchParams.get(paramName)) || 1;
		const internalPage = urlPage - 1;
		if (currentPage !== internalPage) currentPage = internalPage;
	});

	async function updatePage(newPage: number) {
		if (isUpdating) return;
		isUpdating = true;
		currentPage = newPage;
		const url = new URL(pageState.url);
		if (newPage + 1 !== 1) {
			url.searchParams.set(paramName, String(newPage + 1));
		} else {
			url.searchParams.delete(paramName);
		}
		await goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
		isUpdating = false;
	}

	return {
		get page() { return currentPage; },
		set page(v: number) { currentPage = v; },
		updatePage,
	};
}
