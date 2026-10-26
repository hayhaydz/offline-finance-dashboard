import { invalidateAll } from "$app/navigation";

export function useSubmitFeedback() {
	let message = $state<{ type: "success" | "error"; text: string } | null>(
		null,
	);
	let isSubmitting = $state(false);

	// Auto-clear success messages after 10 seconds
	$effect(() => {
		if (message?.type === "success") {
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
		options?: {
			resetForm?: boolean;
			onSuccess?: () => void;
			/** Apply failure data to the page `form` prop (enables confirm round-trips). */
			applyFailures?: boolean;
		},
	) {
		return () => {
			isSubmitting = true;
			return async (callbackArgs: {
				formElement: HTMLFormElement;
				result: {
					type: string;
					data?: unknown;
					error?: { message?: string };
				};
				update: (opts?: { reset?: boolean }) => Promise<void>;
			}) => {
				isSubmitting = false;
				const { formElement, result, update } = callbackArgs;
				if (result.type === "redirect") {
					// Follow action redirects through the framework's apply path
					// (the page is navigating away — no feedback or invalidation).
					await update();
					return;
				}
				if (result.type === "success") {
					message = { type: "success", text: successText };
					if (options?.resetForm && formElement) formElement.reset();
					options?.onSuccess?.();
				} else if (result.type === "failure" && result.data) {
					const errorData = result.data as { error?: string };
					// "confirm" failures render as an in-page banner via `form`,
					// not as a feedback message.
					if (
						errorData.error &&
						!(options?.applyFailures && errorData.error === "confirm")
					) {
						message = { type: "error", text: errorData.error };
					}
				} else if (result.type === "error") {
					// Thrown/5xx action results: generic banner (dev appends the
					// server error message) instead of failing silently.
					const detail = import.meta.env?.DEV
						? ` (${result.error?.message ?? "unknown error"})`
						: "";
					message = {
						type: "error",
						text: `Action failed — try again${detail}`,
					};
				}
				if (options?.applyFailures) {
					// Applies the default behavior (sets the `form` prop),
					// driving confirm banners and clearing them on success.
					await update({ reset: false });
				}
				await invalidateAll();
			};
		};
	}

	return {
		get message() {
			return message;
		},
		set message(m: { type: "success" | "error"; text: string } | null) {
			message = m;
		},
		get isSubmitting() {
			return isSubmitting;
		},
		dismiss,
		createEnhanceHandler,
	};
}
