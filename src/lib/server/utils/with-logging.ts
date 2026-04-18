/**
 * Logging wrapper for server service functions.
 *
 * Wraps an async function to automatically log entry, success, and error.
 * Reduces boilerplate while ensuring consistent log format.
 *
 * Usage:
 *   export const getBudgetStatus = withLogging(
 *     "getBudgetStatus",
 *     async (userId: number, year: number, month: number) => { ... }
 *   );
 */

import { devLog, logError } from "$lib/server/logger";

type AsyncFn = (...args: never[]) => Promise<unknown>;

/**
 * Wrap an async function with automatic entry/success/error logging.
 *
 * @param label - Category name for log entries (typically the function name)
 * @param fn - The async function to wrap
 * @returns Wrapped function with logging
 */
export function withLogging<T extends AsyncFn>(
	label: string,
	fn: T,
): T {
	return (async (...args: Parameters<T>) => {
		devLog(label, "Starting");

		try {
			const result = await fn(...args);
			devLog(label, "Completed");
			return result;
		} catch (error) {
			logError(label, "Failed", error);
			throw error;
		}
	}) as T;
}
