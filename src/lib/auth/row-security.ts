import { eq, and, SQL } from 'drizzle-orm';
import type { User } from '$lib/db/schema';

/**
 * Adds user_id filter to a database query to enforce row-level security.
 * This ensures users can only access their own data.
 *
 * @param userId - The user's ID from the session
 * @param table - The Drizzle table with a userId column
 * @returns A SQL condition that filters by user_id
 *
 * @example
 * ```ts
 * const userAccounts = await db.query.accounts.findMany({
 *   where: withUserFilter(locals.user.id, accounts)
 * });
 * ```
 */
export function withUserFilter<T extends { userId: number }>(
	userId: number,
	table: T
): SQL {
	return eq(table.userId, userId);
}

/**
 * Validates that a resource belongs to the current user.
 * Throws a 403 error if the user doesn't own the resource.
 *
 * @param resource - The resource to check (must have userId property)
 * @param user - The current user from the session
 * @param resourceType - Human-readable resource type for error message
 * @throws Error with 403 status if user doesn't own the resource
 *
 * @example
 * ```ts
 * const account = await db.query.accounts.findFirst({
 *   where: eq(accounts.id, accountId)
 * });
 *
 * if (!account) {
 *   throw error(404, 'Account not found');
 * }
 *
 * validateUserAccess(account, locals.user, 'Account');
 * // Throws 403 if account.userId !== locals.user.id
 * ```
 */
export function validateUserAccess<T extends { userId: number }>(
	resource: T | null | undefined,
	user: User,
	resourceType: string = 'Resource'
): asserts resource is T {
	if (!resource) {
		throw new Error(`${resourceType} not found`);
	}

	if (resource.userId !== user.id) {
		throw new Error(`You do not have permission to access this ${resourceType.toLowerCase()}`);
	}
}

/**
 * Helper to check if a user owns a resource without throwing.
 * Returns true if the user owns the resource, false otherwise.
 *
 * @param resource - The resource to check (must have userId property)
 * @param user - The current user from the session
 * @returns True if user owns the resource, false otherwise
 *
 * @example
 * ```ts
 * const account = await db.query.accounts.findFirst({
 *   where: eq(accounts.id, accountId)
 * });
 *
 * if (!checkUserAccess(account, locals.user)) {
 *   throw error(403, 'Access denied');
 * }
 * ```
 */
export function checkUserAccess<T extends { userId: number }>(
	resource: T | null | undefined,
	user: User
): resource is T {
	if (!resource) {
		return false;
	}
	return resource.userId === user.id;
}

/**
 * Validates that multiple resources all belong to the current user.
 * Throws a 403 error if any resource doesn't belong to the user.
 *
 * @param resources - Array of resources to check
 * @param user - The current user from the session
 * @param resourceType - Human-readable resource type for error message
 * @throws Error with 403 status if any resource doesn't belong to the user
 *
 * @example
 * ```ts
 * const accounts = await db.query.accounts.findMany({
 *   where: inArray(accounts.id, accountIds)
 * });
 *
 * validateAllUserAccess(accounts, locals.user, 'Account');
 * // Throws 403 if any account.userId !== locals.user.id
 * ```
 */
export function validateAllUserAccess<T extends { userId: number }>(
	resources: T[],
	user: User,
	resourceType: string = 'Resource'
): void {
	for (const resource of resources) {
		if (resource.userId !== user.id) {
			throw new Error(
				`You do not have permission to access one or more ${resourceType.toLowerCase()}`
			);
		}
	}
}

/**
 * Creates a where clause that combines user_id filtering with additional conditions.
 * Use this when you need to filter by user_id AND other conditions.
 *
 * @param userId - The user's ID from the session
 * @param table - The Drizzle table with a userId column
 * @param conditions - Additional SQL conditions to combine with user_id filter
 * @returns A combined SQL condition
 *
 * @example
 * ```ts
 * const activeAccounts = await db.query.accounts.findMany({
 *   where: andWithUserFilter(locals.user.id, accounts, eq(accounts.isActive, true))
 * });
 * ```
 */
export function andWithUserFilter<T extends { userId: number }>(
	userId: number,
	table: T,
	...conditions: SQL[]
): SQL {
	return and(eq(table.userId, userId), ...conditions) ?? eq(table.userId, userId);
}
