/**
 * Generic Result type for service function return values.
 *
 * Convention: Server service functions return Result<T>.
 * Route files (+page.server.ts) unwrap and throw on failure.
 *
 * Inspired by Rust's Result<T, E> — discriminated union on `ok`.
 */

// ── Core types ────────────────────────────────────────────────

export type Result<T> =
	| { ok: true; data: T }
	| { ok: false; error: string };

/** Convenience alias for operations that return nothing on success. */
export type VoidResult = Result<void>;

// ── Constructors ──────────────────────────────────────────────

export function ok<T>(data: T): Result<T> {
	return { ok: true, data };
}

export function okVoid(): VoidResult {
	return { ok: true, data: undefined };
}

export function err<T = never>(error: string): Result<T> {
	return { ok: false, error };
}

// ── Helpers ───────────────────────────────────────────────────

/** Type guard: narrows to the success branch. */
export function isOk<T>(result: Result<T>): result is { ok: true; data: T } {
	return result.ok;
}

/** Type guard: narrows to the failure branch. */
export function isErr<T>(result: Result<T>): result is { ok: false; error: string } {
	return !result.ok;
}

/**
 * Unwrap a Result, returning data on success or throwing the error string.
 * Use in route files where throwing is the correct error propagation strategy.
 */
export function unwrap<T>(result: Result<T>): T {
	if (isOk(result)) return result.data;
	throw new Error(result.error);
}
