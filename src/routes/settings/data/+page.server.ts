import { redirect, fail } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, spendingCategories } from "$lib/db/schema";
import { devLog, logError, logFormData } from "$lib/utils/logger";
import {
	getOverlappingTransactions,
	batchInsertTransactions,
	type ImportRow,
} from "$lib/server/imports";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		logError("settings-data", "Authentication required");
		redirect(302, "/login");
	}

	devLog("settings-data", "Data settings loaded", {
		username: locals.user.username,
		userId: locals.user.id,
	});

	// Get user's open accounts (for dropdown)
	const userAccounts = await db.query.accounts.findMany({
		where: and(
			eq(accounts.userId, locals.user.id),
			isNull(accounts.closedAt),
		),
		orderBy: (accounts, { asc }) => [asc(accounts.name)],
	});

	// Get user's spending categories (for validation reference)
	const categories = await db.query.spendingCategories.findMany({
		where: and(
			eq(spendingCategories.userId, locals.user.id),
			isNull(spendingCategories.deletedAt),
		),
	});

	return {
		user: locals.user,
		accounts: userAccounts.map((a) => ({
			id: a.id,
			slug: a.slug,
			name: a.name,
			type: a.type,
		})),
		categories: categories.map((c) => ({
			key: c.key,
			name: c.name,
		})),
	};
};

export const actions: Actions = {
	"fetch-overlaps": async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("settings-data:fetch-overlaps", formData);

		const accountId = parseInt(formData.get("accountId") as string);
		const fromDate = formData.get("fromDate") as string;
		const toDate = formData.get("toDate") as string;

		if (!accountId || !fromDate || !toDate) {
			return fail(400, {
				action: "fetch-overlaps",
				error: "Missing required fields: accountId, fromDate, toDate",
			});
		}

		try {
			const overlaps = await getOverlappingTransactions(
				locals.user.id,
				accountId,
				fromDate,
				toDate,
			);

			devLog(
				"settings-data:fetch-overlaps",
				`Found ${overlaps.length} overlapping transactions`,
			);

			return {
				action: "fetch-overlaps",
				success: true,
				overlaps,
			};
		} catch (error) {
			logError("settings-data:fetch-overlaps", "Failed to fetch overlaps", error);
			return fail(500, {
				action: "fetch-overlaps",
				error: error instanceof Error ? error.message : "Failed to fetch overlaps",
			});
		}
	},

	import: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("settings-data:import", formData);

		const accountId = parseInt(formData.get("accountId") as string);
		const rowsJson = formData.get("rows") as string;

		if (!accountId || !rowsJson) {
			return fail(400, {
				action: "import",
				error: "Missing required fields: accountId, rows",
			});
		}

		try {
			const rows: ImportRow[] = JSON.parse(rowsJson);

			if (rows.length > 5000) {
				return fail(400, {
					action: "import",
					error: "Cannot import more than 5000 rows at once",
				});
			}

			devLog("settings-data:import", `Importing ${rows.length} rows`, {
				userId: locals.user.id,
				accountId,
			});

			const insertedCount = await batchInsertTransactions(
				locals.user.id,
				accountId,
				rows,
			);

			const account = await db.query.accounts.findFirst({
				where: eq(accounts.id, accountId),
			});

			devLog("settings-data:import", `Import complete: ${insertedCount} rows`, {
				accountSlug: account?.slug,
			});

			return {
				action: "import",
				success: true,
				imported: insertedCount,
				accountSlug: account?.slug,
			};
		} catch (error) {
			logError("settings-data:import", "Import failed", error);
			return fail(500, {
				action: "import",
				error: error instanceof Error ? error.message : "Import failed",
			});
		}
	},
};
