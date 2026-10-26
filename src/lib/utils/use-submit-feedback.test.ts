import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({
	invalidateAll: vi.fn(),
}));

import { invalidateAll } from "$app/navigation";
import { useSubmitFeedback } from "./use-submit-feedback.svelte";

type EnhanceCallbackArgs = {
	formElement: HTMLFormElement;
	result: {
		type: string;
		data?: unknown;
		error?: { message?: string };
	};
	update: (opts?: { reset?: boolean }) => Promise<void>;
};

type SubmitCallback = (args: EnhanceCallbackArgs) => Promise<void>;

function makeArgs(
	result: EnhanceCallbackArgs["result"],
	update: EnhanceCallbackArgs["update"] = vi.fn(),
): EnhanceCallbackArgs {
	return {
		formElement: {} as HTMLFormElement,
		result,
		update,
	};
}

function submitCallback(
	feedback: ReturnType<typeof useSubmitFeedback>,
	options?: { applyFailures?: boolean },
): SubmitCallback {
	return feedback.createEnhanceHandler("Saved", options)() as SubmitCallback;
}

describe("useSubmitFeedback — enhanced forms never fail silently", () => {
	beforeEach(() => {
		vi.mocked(invalidateAll).mockClear();
	});

	it("shows failure feedback when the action result is {type:'error'}", async () => {
		const feedback = useSubmitFeedback();
		const callback = submitCallback(feedback);

		await callback(
			makeArgs({ type: "error", error: { message: "database exploded" } }),
		);

		expect(feedback.message).not.toBeNull();
		expect(feedback.message?.type).toBe("error");
		// Generic copy always present; dev appends the server message
		expect(feedback.message?.text).toContain("Action failed");
		expect(feedback.message?.text).toContain("database exploded");
		expect(feedback.isSubmitting).toBe(false);
	});

	it("follows {type:'redirect'} results via update() without feedback or invalidation", async () => {
		const feedback = useSubmitFeedback();
		const callback = submitCallback(feedback);
		const update = vi.fn();

		await callback(
			makeArgs(
				{
					type: "redirect",
					status: 303,
				} as unknown as EnhanceCallbackArgs["result"],
				update,
			),
		);

		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith();
		expect(invalidateAll).not.toHaveBeenCalled();
		expect(feedback.message).toBeNull();
		expect(feedback.isSubmitting).toBe(false);
	});

	it("still surfaces failure data and skips confirm-banner failures under applyFailures", async () => {
		const feedback = useSubmitFeedback();
		const update = vi.fn();
		const callback = submitCallback(feedback, { applyFailures: true });

		await callback(
			makeArgs({ type: "failure", data: { error: "Bad input" } }, update),
		);

		expect(feedback.message?.type).toBe("error");
		expect(feedback.message?.text).toBe("Bad input");
		expect(update).toHaveBeenCalledWith({ reset: false });

		const confirmCallback = submitCallback(feedback, { applyFailures: true });
		await confirmCallback(
			makeArgs({ type: "failure", data: { error: "confirm" } }, update),
		);
		// "confirm" renders via `form`, not feedback — prior message untouched
		expect(feedback.message?.text).toBe("Bad input");
	});
});
