/**
 * Global loading state using Svelte stores
 *
 * Provides reactive loading state that can be used throughout the app.
 * Use this singleton to show/hide loading indicators.
 */

import { writable } from "svelte/store";

function createLoadingStore() {
	const { subscribe, update } = writable({
		isLoading: false,
		message: "",
	});

	return {
		subscribe,
		start: (message = "") => update(() => ({ isLoading: true, message })),
		stop: () => update(() => ({ isLoading: false, message: "" })),
		toggle: () => update((s) => ({ ...s, isLoading: !s.isLoading })),
	};
}

export const loading = createLoadingStore();
