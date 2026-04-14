/**
 * Server-side pagination utilities.
 *
 * Standardizes the URL page parameter parsing and offset calculation
 * used across all paginated +page.server.ts load functions.
 */

export interface PaginationParams {
	/** Current page (1-indexed) */
	page: number;
	/** Number of items per page */
	pageSize: number;
	/** SQL offset (0-indexed) */
	offset: number;
}

export interface PaginationMeta {
	/** Total number of items */
	total: number;
	/** Current page (1-indexed, clamped to valid range) */
	page: number;
	/** Items per page */
	pageSize: number;
	/** Total number of pages */
	totalPages: number;
	/** SQL offset */
	offset: number;
}

/**
 * Parse and validate pagination from URL search params.
 *
 * Reads the given query parameter, validates it, and calculates offset.
 * Returns safe defaults for invalid/missing values.
 *
 * @param url - SvelteKit URL object from load function
 * @param pageSize - Number of items per page (default: 20)
 * @param paramName - URL parameter name (default: "page")
 */
export function parsePagination(
	url: URL,
	pageSize = 20,
	paramName = "page",
): PaginationParams {
	const pageParam = url.searchParams.get(paramName);
	const parsed = pageParam ? Number.parseInt(pageParam, 10) : 1;
	const page = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
	const offset = (page - 1) * pageSize;

	return { page, pageSize, offset };
}

/**
 * Calculate full pagination metadata given total item count.
 *
 * Clamps the page to the valid range (1 to totalPages).
 * Use after obtaining the total count from a DB query.
 *
 * @param total - Total number of items from count query
 * @param page - Requested page number (1-indexed)
 * @param pageSize - Items per page
 */
export function calculatePagination(
	total: number,
	page: number,
	pageSize: number,
): PaginationMeta {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(page, totalPages);
	const offset = (safePage - 1) * pageSize;

	return { total, page: safePage, pageSize, totalPages, offset };
}
