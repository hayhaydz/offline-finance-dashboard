import { fail } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, spendingCategories } from "$lib/db/schema";
import {
	batchInsertTransactions,
	getOverlappingTransactions,
	type ImportRow,
	ImportValidationError,
} from "$lib/server/imports";
import { commitReimport, previewReimport } from "$lib/server/imports-update";
import {
	devLog,
	isVerboseDebug,
	logError,
	logFormData,
} from "$lib/server/logger";
import {
	listRefundCandidates,
	reclassifyValueChangeRefunds,
} from "$lib/server/refund-reclassification";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import type { Actions, PageServerLoad } from "./$types";

/** Reimport payload caps so a huge file cannot blow up the preview render. */
const MAX_PREVIEW_EDITS = 300;
const MAX_PREVIEW_INSERTS = 200;
const MAX_PREVIEW_DELETES = 200;
const MAX_REIMPORT_TEXT_CHARS = 10_000_000;
const MAX_PREVIEW_ERRORS = 50;

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	if (isVerboseDebug()) {
		devLog("settings-data", "Data settings loaded", {
			username: user.username,
			userId: user.id,
		});
	}

	// Get user's open accounts (for dropdown)
	const userAccounts = await db.query.accounts.findMany({
		where: and(eq(accounts.userId, user.id), isNull(accounts.closedAt)),
		orderBy: (accounts, { asc }) => [asc(accounts.name)],
	});

	// Get user's spending categories (for validation reference)
	const categories = await db.query.spendingCategories.findMany({
		where: and(
			eq(spendingCategories.userId, user.id),
			isNull(spendingCategories.deletedAt),
		),
	});

	return {
		user,
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
	"list-refund-candidates": async ({ locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		try {
			const candidates = await listRefundCandidates(user.id);

			devLog(
				"settings-data:list-refund-candidates",
				`Found ${candidates.length} candidate rows`,
			);

			return {
				action: "list-refund-candidates",
				success: true,
				candidates: candidates.map((c) => ({
					slug: c.slug,
					accountName: c.accountName,
					accountSlug: c.accountSlug,
					transactionDate: c.transactionDate.toISOString().split("T")[0],
					amount: c.amount,
					description: c.description,
				})),
			};
		} catch (error) {
			logError(
				"settings-data:list-refund-candidates",
				"Failed to list refund candidates",
				error,
			);
			return fail(500, {
				action: "list-refund-candidates",
				error: "Failed to list refund candidates",
			});
		}
	},

	"reclassify-refunds": async ({ locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		try {
			const reclassified = await reclassifyValueChangeRefunds(user.id);

			return {
				action: "reclassify-refunds",
				success: true,
				reclassified,
			};
		} catch (error) {
			logError(
				"settings-data:reclassify-refunds",
				"Failed to reclassify refunds",
				error,
			);
			return fail(500, {
				action: "reclassify-refunds",
				error: "Failed to reclassify refunds",
			});
		}
	},
	"fetch-overlaps": async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("settings-data:fetch-overlaps", formData);

		const accountId = parseInt(formData.get("accountId") as string, 10);
		const fromDate = formData.get("fromDate") as string;
		const toDate = formData.get("toDate") as string;

		if (!accountId || !fromDate || !toDate) {
			return fail(400, {
				action: "fetch-overlaps",
				error: "Missing required fields: accountId, fromDate, toDate",
			});
		}

		// Validate date format (YYYY-MM-DD)
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
			return fail(400, {
				action: "fetch-overlaps",
				error: "Invalid date format. Use YYYY-MM-DD.",
			});
		}

		try {
			const overlaps = await getOverlappingTransactions(
				user.id,
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
			logError(
				"settings-data:fetch-overlaps",
				"Failed to fetch overlaps",
				error,
			);
			return fail(500, {
				action: "fetch-overlaps",
				error:
					error instanceof ImportValidationError
						? error.message
						: "Could not check for overlapping transactions — nothing was imported. Go back and try again.",
			});
		}
	},

	import: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("settings-data:import", formData);

		const accountId = parseInt(formData.get("accountId") as string, 10);
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
				userId: user.id,
				accountId,
			});

			const insertedCount = await batchInsertTransactions(
				user.id,
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
				error:
					error instanceof ImportValidationError
						? error.message
						: "Could not complete the import — nothing was changed. Check the preview and try again.",
			});
		}
	},

	// -----------------------------------------------------------------------
	// CSV reimport (unified insert/edit/delete) — preview → backup → commit
	// -----------------------------------------------------------------------

	"reimport-preview": async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, {
				action: "reimport-preview",
				errors: ["Authentication required"],
			});
		}

		const formData = await request.formData();
		const csvText = String(formData.get("csvText") ?? "");
		const recovery = formData.get("recovery") === "1";

		if (csvText === "") {
			return fail(400, {
				action: "reimport-preview",
				errors: ["No file contents received — select a file first."],
			});
		}
		if (csvText.length > MAX_REIMPORT_TEXT_CHARS) {
			return fail(400, {
				action: "reimport-preview",
				errors: ["File too large — split it or narrow the export."],
			});
		}

		try {
			const preview = await previewReimport(user.id, csvText, { recovery });
			if (!preview.ok) {
				return fail(400, {
					action: "reimport-preview",
					errors: preview.errors.slice(0, MAX_PREVIEW_ERRORS),
					isBackup: preview.isBackup,
				});
			}

			devLog(
				"settings-data:reimport-preview",
				`Preview: ${preview.counts.inserted} inserted / ${preview.counts.edited} edited / ${preview.counts.deleted} deleted / ${preview.counts.skipped} skipped`,
				{ recovery },
			);

			return {
				action: "reimport-preview",
				success: true,
				recovery,
				preview: {
					counts: preview.counts,
					edits: preview.edits.slice(0, MAX_PREVIEW_EDITS),
					editsTruncated: Math.max(0, preview.edits.length - MAX_PREVIEW_EDITS),
					inserts: preview.inserts.slice(0, MAX_PREVIEW_INSERTS),
					insertsTruncated: Math.max(
						0,
						preview.inserts.length - MAX_PREVIEW_INSERTS,
					),
					deletes: preview.deletes.slice(0, MAX_PREVIEW_DELETES),
					deletesTruncated: Math.max(
						0,
						preview.deletes.length - MAX_PREVIEW_DELETES,
					),
					isBackup: preview.isBackup,
				},
			};
		} catch (err) {
			logError(
				"settings-data:reimport-preview",
				"Reimport preview failed",
				err,
			);
			return fail(500, {
				action: "reimport-preview",
				errors: [
					"Could not preview the file — nothing was changed. Try again.",
				],
			});
		}
	},

	"reimport-commit": async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) {
			return fail(401, {
				action: "reimport-commit",
				errors: ["Authentication required"],
			});
		}

		const formData = await request.formData();
		const csvText = String(formData.get("csvText") ?? "");
		const recovery = formData.get("recovery") === "1";

		if (csvText === "") {
			return fail(400, {
				action: "reimport-commit",
				errors: [
					"No file contents received — start over and select the file again.",
				],
			});
		}
		if (csvText.length > MAX_REIMPORT_TEXT_CHARS) {
			return fail(400, {
				action: "reimport-commit",
				errors: ["File too large — split it or narrow the export."],
			});
		}

		try {
			const result = await commitReimport(user.id, csvText, { recovery });
			if ("errors" in result) {
				return fail(400, {
					action: "reimport-commit",
					errors: result.errors.slice(0, MAX_PREVIEW_ERRORS),
				});
			}

			return {
				action: "reimport-commit",
				success: true,
				recovery,
				counts: result.counts,
				backupFilename: result.backupFilename,
			};
		} catch (err) {
			logError("settings-data:reimport-commit", "Reimport commit failed", err);
			return fail(500, {
				action: "reimport-commit",
				errors: ["Could not apply the file — nothing was changed. Try again."],
			});
		}
	},
};
