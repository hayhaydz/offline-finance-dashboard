import { and, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import { devLog, isVerboseDebug, logError } from "$lib/server/logger";

export interface UpdateTypeExclusionsParams {
	userId: number;
	typeUpdates: Map<string, boolean>;
}

export interface UpdateTypeExclusionsResult {
	affectedRows: number;
	message: string;
}

export async function updateTypeExclusions({
	userId,
	typeUpdates,
}: UpdateTypeExclusionsParams): Promise<UpdateTypeExclusionsResult> {
	if (isVerboseDebug()) devLog("updateTypeExclusions", "Updating type exclusions", { userId, typeCount: typeUpdates.size });
	const userAccounts = await db.query.accounts.findMany({
		where: and(withUserFilter(userId, accounts), isNull(accounts.closedAt)),
		columns: { id: true, type: true },
	});

	const accountsByType = new Map<string, number[]>();
	for (const account of userAccounts) {
		if (!accountsByType.has(account.type)) {
			accountsByType.set(account.type, []);
		}
		accountsByType.get(account.type)?.push(account.id);
	}

	const sqlChunks: SQL[] = [];
	const ids: number[] = [];

	sqlChunks.push(sql` (case`);
	for (const [type, excluded] of typeUpdates.entries()) {
		const typeAccountIds = accountsByType.get(type) ?? [];
		for (const accountId of typeAccountIds) {
			sqlChunks.push(
				sql` when ${accounts.id} = ${accountId} then ${excluded ? 1 : 0}`,
			);
			ids.push(accountId);
		}
	}
	sqlChunks.push(sql` end)`);

	if (ids.length === 0) {
		return { affectedRows: 0, message: "No matching open accounts to update" };
	}

	const finalSql: SQL = sql.join(sqlChunks, sql.raw(" "));

	await db
		.update(accounts)
		.set({ excludedFromNetWorth: finalSql })
		.where(and(withUserFilter(userId, accounts), inArray(accounts.id, ids)));

	return {
		affectedRows: ids.length,
		message: "Exclusions updated successfully",
	};
}
