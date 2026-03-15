import { redirect } from "@sveltejs/kit";
import { desc, eq, inArray, and } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";
import { getUkTaxYearBounds, getTaxFreeStatus } from "$lib/server/calculations";
import type { PageServerLoad } from "./$types";

// Helper: Check if account tax wrapper is tax-free
function isTaxFree(taxWrapper: string): boolean {
	return taxWrapper === 'isa' || taxWrapper === 'lisa' || taxWrapper === 'premium-bonds';
}

function getTaxYearLabel(date: Date): string {
    const bounds = getUkTaxYearBounds(date);
    const startYear = bounds.start.getUTCFullYear();
    const endYear = bounds.end.getUTCFullYear();
    return `${startYear}/${String(endYear).slice(-2)}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	// 1. Get user accounts
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
		columns: { id: true, taxWrapper: true, name: true }
	});

    if (userAccounts.length === 0) {
        return { taxYears: [] };
    }

	const accountIds = userAccounts.map((a) => a.id);
    const accountMap = new Map(userAccounts.map(a => [a.id, a]));

	// 2. Get all interest transactions
	const transactions = await db.query.accountTransactions.findMany({
		where: and(
			inArray(accountTransactions.accountId, accountIds),
			eq(accountTransactions.type, 'interest')
		),
		orderBy: desc(accountTransactions.transactionDate)
	});

    // 3. Group by tax year
    const taxYearsMap = new Map<string, {
        label: string;
        slug: string;
        start: Date;
        end: Date;
        isaInterest: number;
        nonIsaInterest: number;
        transactionCount: number;
    }>();

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
                transactionCount: 0
            });
        }

        const yearData = taxYearsMap.get(label)!;
        const account = accountMap.get(tx.accountId);
        
        if (account) {
            if (isTaxFree(account.taxWrapper)) {
                yearData.isaInterest += tx.amount;
            } else {
                yearData.nonIsaInterest += tx.amount;
            }
            yearData.transactionCount++;
        }
    }

    // 4. Get User Tax Band
	const userWithTaxBand = await db.query.users.findFirst({
		where: eq(users.id, locals.user.id),
		columns: { taxBand: true }
	});
	const taxBand = userWithTaxBand?.taxBand ?? 'basic';

    // 5. Format for display
    const taxYears = Array.from(taxYearsMap.values())
        .sort((a, b) => b.start.getTime() - a.start.getTime()) // Newest first
        .map(year => {
            const status = getTaxFreeStatus(year.nonIsaInterest, taxBand);
            return {
                ...year,
                status,
                taxBand
            };
        });

	return {
		taxYears
	};
};
