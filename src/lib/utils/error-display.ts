/**
 * Normalise a thrown/serialised error value into a display string.
 *
 * SvelteKit's `page.error` is a plain `{ message }` object (HttpError), NOT
 * an Error instance — `String(error)` on it renders "[object Object]"
 * (P0-3, 2026-10-27 audit). Thrown values can also be strings, numbers, or
 * genuinely nested objects; this helper extracts the most useful text.
 */
export function errorDisplayMessage(err: unknown): string {
	if (err === null || err === undefined) return "An unknown error occurred";
	if (typeof err === "string") return err;
	if (err instanceof Error) return err.message;
	if (typeof err === "object") {
		const anyErr = err as { message?: unknown; body?: { message?: unknown } };
		// SvelteKit HttpError: { message, body: { message } }
		if (typeof anyErr.message === "string" && anyErr.message.length > 0) {
			return anyErr.message;
		}
		if (
			typeof anyErr.body?.message === "string" &&
			anyErr.body.message.length > 0
		) {
			return anyErr.body.message;
		}
		try {
			const json = JSON.stringify(err);
			return json === "{}" ? "An unknown error occurred" : json;
		} catch {
			return "An unknown error occurred";
		}
	}
	return String(err);
}
