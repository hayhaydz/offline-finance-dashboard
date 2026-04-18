import { and, desc, eq, inArray } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { getTaxFreeStatus, getUkTaxYearBounds } from "$lib/utils/tax-year-utils";
import { isTaxFreeWrapper } from "$lib/utils/tax-classification";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireAuth(locals);

	const TAX_YEARS_PER_PAGE = 20;
	// 1-indexed URL parameter
	const pageParam = Number(url.searchParams.get("page")) || 1;
	const page = Math.max(0, pageParam - 1); // Convert to 0-indexed
	const offset = page * TAX_YEARS_PER_PAGE;

	// 1. Get user accounts with maturity dates
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(user.id, accounts),
		columns: { id: true, taxWrapper: true, name: true, maturityDate: true },
	});

	if (userAccounts.length === 0) {
		return { taxYears: [], totalPages: 0, totalCount: 0, currentPage: page };
	}

	const accountIds = userAccounts.map((a) => a.id);
	const accountMap = new Map(userAccounts.map((a) => [a.id, a]));

	// 2. Get all interest transactions
	const transactions = await db.query.accountTransactions.findMany({
		where: and(
			inArray(accountTransactions.accountId, accountIds),
			eq(accountTransactions.type, "interest"),
		),
		orderBy: desc(accountTransactions.transactionDate),
	});

	// 3. Group by tax year, filtering out transactions from accounts that mature after the tax year
	const taxYearsMap = new Map<
		string,
		{
			label: string;
			slug: string;
			start: Date;
			end: Date;
			isaInterest: number;
			nonIsaInterest: number;
			transactionCount: number;
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
				isaInterest: 0,
				nonIsaInterest: 0,
				transactionCount: 0,
			});
		}

		const yearData = taxYearsMap.get(label);
		if (!yearData) continue;
		const account = accountMap.get(tx.accountId);

		// Filter out transactions from accounts that mature after this tax year
		if (account?.maturityDate && account.maturityDate > yearData.end) {
			continue; // Skip this transaction
		}

		if (account) {
			if (isTaxFreeWrapper(account.taxWrapper)) {
				yearData.isaInterest += tx.amount;
			} else {
				yearData.nonIsaInterest += tx.amount;
			}
			yearData.transactionCount++;
		}
	}

	// 4. Get User Tax Band
	const userWithTaxBand = await db.query.users.findFirst({
		where: eq(users.id, user.id),
		columns: { taxBand: true },
	});
	const taxBand = userWithTaxBand?.taxBand ?? "basic";

	// 5. Format for display
	const taxYears = Array.from(taxYearsMap.values())
		.filter((year) => year.isaInterest > 0 || year.nonIsaInterest > 0)
		.sort((a, b) => b.start.getTime() - a.start.getTime())
		.map((year) => {
			const status = getTaxFreeStatus(year.nonIsaInterest, taxBand);
			return {
				...year,
				status,
				taxBand,
			};
		});

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
