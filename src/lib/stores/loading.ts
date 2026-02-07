/**
 * Global loading state using Svelte 5 runes
 *
 * Provides reactive loading state that can be used throughout the app.
 * Use this singleton to show/hide loading indicators.
 */

let isLoading = $state(false);
let loadingMessage = $state('');

export const loading = {
	// Subscribe to loading state (for components)
	get state() {
		return isLoading;
	},
	get message() {
		return loadingMessage;
	},

	// Start loading with optional message
	start(message = '') {
		loadingMessage = message;
		isLoading = true;
	},

	// Stop loading
	stop() {
		isLoading = false;
		loadingMessage = '';
	},

	// Toggle loading state
	toggle() {
		isLoading = !isLoading;
	}
};

// Export a reactive getter for components
export function useLoading() {
	return {
		get isLoading() {
			return isLoading;
		},
		get message() {
			return loadingMessage;
		}
	};
}
