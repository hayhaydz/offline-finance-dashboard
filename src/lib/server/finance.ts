export interface AccountWithLatestBalance {
	category: "asset" | "liability";
	balances: Array<{ balanceInCents: number }>;
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
		const balance = account.balances[0]?.balanceInCents ?? 0;

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
