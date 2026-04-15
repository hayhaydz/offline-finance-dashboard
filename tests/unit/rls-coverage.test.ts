import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * RLS Coverage Verification
 *
 * This test statically analyzes server files to ensure all database queries
 * on user-scoped tables include withUserFilter (or an equivalent pattern).
 * It catches missing RLS at the source code level rather than runtime.
 *
 * Three valid RLS patterns are recognised:
 *   1. withUserFilter(userId, table)   — canonical pattern in where clauses
 *   2. eq(table.userId, userId)        — direct equivalent (budgets, categories)
 *   3. validateUserAccess(res, user)    — post-load ownership check for slug lookups
 *
 * Files that only query by accountId (where account ownership is already verified
 * by the calling route) are listed in ACCOUNT_SCOPED_HELPERS and exempted.
 *
 * Files that only INSERT into user-scoped tables (setting userId in values)
 * are listed in INSERT_ONLY_ROUTES and exempted.
 */

// ---------------------------------------------------------------------------
// User-scoped tables (JS variable names from src/lib/db/schema.ts)
// ---------------------------------------------------------------------------

const USER_SCOPED_TABLES = [
	"accounts",
	"accountTransactions",
	"interestRates",
	"accountNotes",
	"goals",
	"goalAllocations",
	"goalMilestones",
	"monthlyReviews",
	"spendingCategories",
	"settings",
	"snapshots",
	"budgetMonths",
] as const;

// ---------------------------------------------------------------------------
// Directories to scan
// ---------------------------------------------------------------------------

const SCAN_ROOTS = ["src/lib/server", "src/routes"];

// ---------------------------------------------------------------------------
// Exclusion patterns
// ---------------------------------------------------------------------------

/** Files matching these patterns are skipped entirely (test files, etc.) */
const SKIP_PATTERNS = /\.(test|spec)\./;

// ---------------------------------------------------------------------------
// Account-scoped helper files
//
// These files query by accountId only. Account ownership is verified at the
// call site (in the route handler) so a direct userId filter is unnecessary.
// ---------------------------------------------------------------------------

const ACCOUNT_SCOPED_HELPERS = new Set([
	// Filters by accountId — caller validates account ownership first
	"src/lib/server/derivedBalances.ts",
	// Filters by accountId — caller validates account ownership first
	"src/lib/server/interestRates.ts",
	// Filters by accountId — caller validates account ownership first
	"src/lib/server/notes.ts",
	// Verifies account.userId explicitly before querying
	"src/lib/server/imports.ts",
	// Some functions filter by accountId (pre-validated), others use eq(accounts.userId, userId)
	"src/lib/server/calculations.ts",
	// Some functions filter by accountId/slug, getTransactions uses eq(accounts.userId, userId)
	"src/lib/server/transactions.ts",
	// getAccountInterestSummary queries by accountId — caller validates account ownership
	"src/lib/server/interestBreakdown/index.ts",
]);

// ---------------------------------------------------------------------------
// INSERT-only route files
//
// These route files only INSERT into user-scoped tables. They set userId
// directly in the insert values (not via a where clause), so they don't
// need withUserFilter. Their load functions delegate to server helpers
// that already apply RLS.
// ---------------------------------------------------------------------------

const INSERT_ONLY_ROUTES = new Set([
	// Creates a new account — sets userId in insert values
	"src/routes/accounts/create/+page.server.ts",
	// Creates a new goal — sets userId in insert values
	"src/routes/goals/create/+page.server.ts",
	// Creates a new snapshot — sets userId in insert values
	"src/routes/overview/snapshots/create/+page.server.ts",
]);

// ---------------------------------------------------------------------------
// Auth route files — these query users/sessions/backupCodes tables which are
// NOT user-scoped. They never query accounts, goals, etc.
// ---------------------------------------------------------------------------

const AUTH_ROUTES = new Set([
	"src/routes/(auth)/login/+page.server.ts",
	"src/routes/(auth)/register/+page.server.ts",
	"src/routes/(auth)/mfa-setup/+page.server.ts",
	"src/routes/(auth)/dev-login/+page.server.ts",
	"src/routes/logout/+page.server.ts",
	"src/routes/settings/security/+page.server.ts",
	"src/routes/settings/general/+page.server.ts",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllTsFiles(root: string): string[] {
	const results: string[] = [];

	function walk(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (
				entry.isFile() &&
				full.endsWith(".ts") &&
				!SKIP_PATTERNS.test(entry.name)
			) {
				results.push(full);
			}
		}
	}

	walk(root);
	return results;
}

/**
 * Check whether a file's content references any user-scoped table.
 */
function usesUserScopedTable(content: string): string[] {
	const found: string[] = [];
	for (const table of USER_SCOPED_TABLES) {
		const regex = new RegExp(`\\b${table}\\b`);
		if (regex.test(content)) {
			found.push(table);
		}
	}
	return found;
}

/**
 * Check whether a file actually executes database queries.
 * This avoids false positives from files that only reference table names
 * in comments, URL strings, or type imports.
 */
function hasDbQuery(content: string): boolean {
	// db.query.TABLE.findMany / findFirst
	if (/db\.query\.\w+\.(findMany|findFirst|find)/.test(content)) return true;
	// db.select(...).from(...)
	if (/db\.select\(/.test(content)) return true;
	// db.insert(...).values(...)
	if (/db\.insert\(/.test(content)) return true;
	// db.update(...)
	if (/db\.update\(/.test(content)) return true;
	// db.delete(...)
	if (/db\.delete\(/.test(content)) return true;
	// tx.insert / tx.update / tx.delete (transaction context)
	if (/tx\.(insert|update|delete)\(/.test(content)) return true;
	return false;
}

/**
 * Check whether a file includes any recognised RLS pattern.
 */
function hasRLSPattern(content: string): boolean {
	// Pattern 1: withUserFilter import or usage
	if (/withUserFilter/.test(content)) return true;

	// Pattern 2: validateUserAccess import or usage
	if (/validateUserAccess/.test(content)) return true;

	// Pattern 3: Direct eq(table.userId, userId/user.id/locals.user.id) filter
	if (/eq\(\w+\.userId\s*,/.test(content)) return true;

	return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RLS coverage", () => {
	const projectRoot = path.resolve(__dirname, "../..");

	// Collect all non-test .ts files from scan directories
	const allFiles: string[] = [];
	for (const scanRoot of SCAN_ROOTS) {
		const absRoot = path.join(projectRoot, scanRoot);
		if (fs.existsSync(absRoot)) {
			for (const f of getAllTsFiles(absRoot)) {
				allFiles.push(path.relative(projectRoot, f));
			}
		}
	}

	it("should find server files to scan", () => {
		expect(allFiles.length).toBeGreaterThan(0);
	});

	// Classify each file
	const violations: { file: string; tables: string[] }[] = [];
	const covered: { file: string; tables: string[]; pattern: string }[] = [];
	const exempted: { file: string; tables: string[]; reason: string }[] = [];

	for (const file of allFiles) {
		const absPath = path.join(projectRoot, file);

		let content: string;
		try {
			content = fs.readFileSync(absPath, "utf-8");
		} catch {
			continue;
		}

		const tables = usesUserScopedTable(content);
		if (tables.length === 0) continue;

		// Skip files that don't actually query the database.
		// Table names can appear in comments, URL strings, or type imports
		// without posing any RLS risk.
		if (!hasDbQuery(content)) continue;

		const normalizedFile = file.replace(/\\/g, "/");

		// Check exemptions
		if (ACCOUNT_SCOPED_HELPERS.has(normalizedFile)) {
			exempted.push({
				file: normalizedFile,
				tables,
				reason: "account-scoped helper (ownership verified by caller)",
			});
			continue;
		}
		if (INSERT_ONLY_ROUTES.has(normalizedFile)) {
			exempted.push({
				file: normalizedFile,
				tables,
				reason: "INSERT-only route (sets userId in insert values)",
			});
			continue;
		}
		if (AUTH_ROUTES.has(normalizedFile)) {
			continue;
		}

		// Check for RLS pattern
		if (hasRLSPattern(content)) {
			let pattern = "eq(table.userId, userId)";
			if (/withUserFilter/.test(content)) pattern = "withUserFilter";
			else if (/validateUserAccess/.test(content))
				pattern = "validateUserAccess";
			covered.push({ file: normalizedFile, tables, pattern });
		} else {
			violations.push({ file: normalizedFile, tables });
		}
	}

	it("all server files with user-scoped queries must use an RLS pattern", () => {
		if (violations.length > 0) {
			const details = violations
				.map((v) => `  ${v.file} — tables: ${v.tables.join(", ")}`)
				.join("\n");
			expect.fail(
				`Found ${violations.length} file(s) with user-scoped queries missing RLS:\n${details}`,
			);
		}
	});

	it("should have broad RLS coverage across the codebase", () => {
		expect(covered.length).toBeGreaterThanOrEqual(20);
	});

	it("exempted helpers should actually use accountId or insert-only patterns", () => {
		expect(exempted.length).toBeGreaterThan(0);

		for (const entry of exempted) {
			const absPath = path.join(projectRoot, entry.file);
			const content = fs.readFileSync(absPath, "utf-8");
			const usesAccountId = /accountId/.test(content);
			const isInsertOnly = /\.insert\(/.test(content);
			expect(
				usesAccountId || isInsertOnly,
				`${entry.file} is exempted but doesn't use accountId or insert`,
			).toBe(true);
		}
	});

	it("should document which RLS pattern each covered file uses", () => {
		const patterns = new Set(covered.map((c) => c.pattern));
		// The codebase should use at least 2 of the 3 patterns
		expect(patterns.size).toBeGreaterThanOrEqual(2);
		// withUserFilter should be the most common pattern
		const withFilterCount = covered.filter(
			(c) => c.pattern === "withUserFilter",
		).length;
		expect(withFilterCount).toBeGreaterThan(0);
	});
});
