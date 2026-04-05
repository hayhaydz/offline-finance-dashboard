import { and, isNull } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from "$lib/server/derivedBalances";
import { devLog } from "$lib/utils/logger";
import { formatAccountType } from "$lib/utils/currency";

export interface AccountWithLatestBalance {
	category: "asset" | "liability";
	currentBalance?: number | null;
	balances?: Array<{ balanceInCents: number }>;
}

export interface TotalsResult {
	totalAssets: number;
	totalLiabilities: number;
	netWorth: number;
}

export function calculateAssetsAndLiabilities(
	accounts: AccountWithLatestBalance[],
): TotalsResult {
	let totalAssets = 0;
	let totalLiabilities = 0;

	for (const account of accounts) {
		const balance =
			account.currentBalance ?? account.balances?.[0]?.balanceInCents ?? 0;

		if (account.category === "asset") {
			if (balance >= 0) {
				totalAssets += balance;
			} else {
				totalLiabilities += balance;
			}
		} else {
			totalLiabilities += balance;
		}
	}

	return {
		totalAssets,
		totalLiabilities,
		netWorth: totalAssets + totalLiabilities,
	};
}

export interface NetWorthSummary {
	netWorth: number;
	totalAssets: number;
	totalLiabilities: number;
	excludedAssets: number;
	excludedLiabilities: number;
	exclusionCount: number;
	excludedTypeNames: string[];
	hasStaleData: boolean;
	dateRange: { oldest: Date; newest: Date };
}

export async function getNetWorthSummary(
	userId: number,
): Promise<NetWorthSummary> {
	// Fetch ALL open accounts for the user (not paginated)
	const userAccounts = await db.query.accounts.findMany({
		where: and(withUserFilter(userId, accounts), isNull(accounts.closedAt)),
	});

	const accountIds = userAccounts.map((a) => a.id);

	const [currentBalances, latestTransactionDates] = await Promise.all([
		getCurrentBalancesForAccounts(accountIds),
		getLatestTransactionDateForAccounts(accountIds),
	]);

	// Enrich accounts with derived balances
	const enriched = userAccounts.map((account) => ({
		...account,
		category: account.category as "asset" | "liability",
		currentBalance: currentBalances.get(account.id) ?? 0,
		lastUpdated: latestTransactionDates.get(account.id) ?? null,
	}));

	// Split into included and excluded
	const includedAccounts = enriched.filter((a) => !a.excludedFromNetWorth);
	const excludedAccounts = enriched.filter((a) => a.excludedFromNetWorth);

	// Calculate totals for both groups
	const includedTotals = calculateAssetsAndLiabilities(includedAccounts);
	const excludedTotals = calculateAssetsAndLiabilities(excludedAccounts);

	// Count excluded types (type is excluded only when ALL open accounts of that type are excluded)
	const typeMap = new Map<string, { total: number; excluded: number }>();
	for (const a of enriched) {
		const entry = typeMap.get(a.type) ?? { total: 0, excluded: 0 };
		entry.total++;
		if (a.excludedFromNetWorth) entry.excluded++;
		typeMap.set(a.type, entry);
	}

	const excludedTypes = new Set(
		Array.from(typeMap.entries())
			.filter(([, { total, excluded }]) => total > 0 && excluded === total)
			.map(([type]) => type),
	);

	const excludedTypeNames = Array.from(excludedTypes).map((t) =>
		formatAccountType(t),
	);

	// Date range from transaction recency
	const allDates = enriched
		.map((a) => a.lastUpdated)
		.filter((d): d is Date => Boolean(d));

	let oldestDate = new Date();
	let newestDate = new Date();

	if (allDates.length > 0) {
		const dates = allDates.map((d) => d.getTime());
		oldestDate = new Date(Math.min(...dates));
		newestDate = new Date(Math.max(...dates));
	}

	// Check for stale data (30+ days old)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

	const hasStaleData = includedAccounts.some(
		(a) => a.lastUpdated && a.lastUpdated < thirtyDaysAgo,
	);

	devLog("netWorthSummary", "Calculated net worth summary", {
		userId,
		netWorth: includedTotals.netWorth,
		totalAssets: includedTotals.totalAssets,
		totalLiabilities: includedTotals.totalLiabilities,
		excludedTypes: excludedTypeNames,
	});

	return {
		netWorth: includedTotals.netWorth,
		totalAssets: includedTotals.totalAssets,
		totalLiabilities: includedTotals.totalLiabilities,
		excludedAssets: excludedTotals.totalAssets,
		excludedLiabilities: excludedTotals.totalLiabilities,
		exclusionCount: excludedTypes.size,
		excludedTypeNames,
		hasStaleData,
		dateRange: { oldest: oldestDate, newest: newestDate },
	};
}
