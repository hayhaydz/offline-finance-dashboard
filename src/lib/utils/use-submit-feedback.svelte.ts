import { invalidateAll } from '$app/navigation';

export function useSubmitFeedback() {
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let isSubmitting = $state(false);

	// Auto-clear success messages after 10 seconds
	$effect(() => {
		if (message?.type === 'success') {
			const timeout = setTimeout(() => {
				message = null;
			}, 10000);
			return () => clearTimeout(timeout);
		}
	});

	function dismiss() {
		message = null;
	}

	function createEnhanceHandler(
		successText: string,
		options?: { resetForm?: boolean; onSuccess?: () => void }
	) {
		return () => {
			isSubmitting = true;
			return async ({ formElement, result }: any) => {
				isSubmitting = false;
				if (result.type === 'success') {
					message = { type: 'success', text: successText };
					if (options?.resetForm && formElement) formElement.reset();
					options?.onSuccess?.();
				} else if (result.type === 'failure' && result.data) {
					const errorData = result.data as { error?: string };
					if (errorData.error) message = { type: 'error', text: errorData.error };
				}
				await invalidateAll();
			};
		};
	}

	return {
		get message() {
			return message;
		},
		set message(m: { type: 'success' | 'error'; text: string } | null) {
			message = m;
		},
		get isSubmitting() {
			return isSubmitting;
		},
		dismiss,
		createEnhanceHandler
	};
}
