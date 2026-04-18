import { and, desc, eq, inArray } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import {
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
} from "$lib/utils/tax-year-utils";
import { TAX_FREE_WRAPPERS } from "$lib/utils/domain-constants";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireAuth(locals);

	const TAX_YEARS_PER_PAGE = 20;
	// 1-indexed URL parameter
	const pageParam = Number(url.searchParams.get("page")) || 1;
	const page = Math.max(0, pageParam - 1); // Convert to 0-indexed
	const offset = page * TAX_YEARS_PER_PAGE;

	// 1. Get user ISA accounts
	const isaAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(user.id, accounts),
			inArray(accounts.taxWrapper, TAX_FREE_WRAPPERS),
		),
		columns: { id: true, taxWrapper: true },
	});

	if (isaAccounts.length === 0) {
		return { taxYears: [], totalPages: 0, totalCount: 0, currentPage: page };
	}

	const accountIds = isaAccounts.map((a) => a.id);

	// 2. Get all deposit transactions for ISA accounts
	const transactions = await db.query.accountTransactions.findMany({
		where: and(
			inArray(accountTransactions.accountId, accountIds),
			eq(accountTransactions.type, "deposit"),
		),
		orderBy: desc(accountTransactions.transactionDate),
	});

	// 3. Group by tax year and calculate totals
	const taxYearsMap = new Map<
		string,
		{
			label: string;
			slug: string;
			start: Date;
			end: Date;
			totalSubscribed: number;
			allowanceUsed: number;
			allowanceRemaining: number;
			utilizationPercent: number;
			transactionCount: number;
			overAllowance: boolean;
			allowance: number;
		}
	>();

	for (const tx of transactions) {
		const bounds = getUkTaxYearBounds(tx.transactionDate);
		const startYear = bounds.start.getUTCFullYear();
		const endYear = bounds.end.getUTCFullYear();
		const label = `${startYear}/${String(endYear).slice(-2)}`;
		const slug = `${startYear}-${String(endYear).slice(-2)}`;

		if (!taxYearsMap.has(label)) {
			taxYearsMap.set(label, {
				label,
				slug,
				start: bounds.start,
				end: bounds.end,
				totalSubscribed: 0,
				allowanceUsed: 0,
				allowanceRemaining: ISA_ALLOWANCE_IN_CENTS,
				utilizationPercent: 0,
				transactionCount: 0,
				overAllowance: false,
				allowance: ISA_ALLOWANCE_IN_CENTS,
			});
		}

		const yearData = taxYearsMap.get(label);
		if (!yearData) continue;
		yearData.totalSubscribed += tx.amount;
		yearData.allowanceUsed += tx.amount;
		yearData.allowanceRemaining = Math.max(
			0,
			ISA_ALLOWANCE_IN_CENTS - yearData.allowanceUsed,
		);
		yearData.utilizationPercent = Math.min(
			100,
			Math.round((yearData.allowanceUsed / ISA_ALLOWANCE_IN_CENTS) * 100),
		);
		yearData.transactionCount++;
		yearData.overAllowance = yearData.allowanceUsed > ISA_ALLOWANCE_IN_CENTS;
	}

	// 4. Format for display, newest first
	const taxYears = Array.from(taxYearsMap.values())
		.filter((year) => year.totalSubscribed > 0)
		.sort((a, b) => b.start.getTime() - a.start.getTime());

	const totalCount = taxYears.length;
	const totalPages = Math.ceil(totalCount / TAX_YEARS_PER_PAGE);
	const paginatedTaxYears = taxYears.slice(offset, offset + TAX_YEARS_PER_PAGE);

	return {
		taxYears: paginatedTaxYears,
		totalPages,
		totalCount,
		currentPage: page,
	};
};
