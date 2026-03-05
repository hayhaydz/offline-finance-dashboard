import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { systemMetadata, users } from "$lib/db/schema";
import { parseCurrency } from "$lib/utils/currency";
import { devLog, logError, logFormData } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Load function for reference settings page
 * Retrieves current monthly expenses value from system_metadata
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		logError("settings-reference", "Authentication required");
		redirect(302, "/login");
	}

	devLog("settings-reference", "Reference page loaded", {
		username: locals.user.username,
		userId: locals.user.id,
	});

	// Query monthly expenses from system_metadata
	const metadataRow = await db
		.select({ value: systemMetadata.value })
		.from(systemMetadata)
		.where(eq(systemMetadata.key, "monthly_expenses"))
		.limit(1);

	let monthlyExpensesInPence: number | null = null;
	if (metadataRow[0]?.value) {
		const parsed = parseInt(metadataRow[0].value, 10);
		if (!Number.isNaN(parsed)) {
			monthlyExpensesInPence = parsed;
		}
	}

	// Fetch user's current tax band
	const user = await db.query.users.findFirst({
		where: eq(users.id, locals.user.id),
		columns: { taxBand: true }
	});

	return {
		monthlyExpensesInPence,
		taxBand: user?.taxBand ?? 'basic',
	};
};

/**
 * Form actions for reference settings
 */
export const actions: Actions = {
	/**
	 * Save monthly expenses action
	 * Validates input, converts to pence, and stores in system_metadata table
	 */
	default: async ({ request, locals }) => {
		if (!locals.user) {
			logError("settings-reference", "Authentication required for save");
			return fail(401, { error: "Authentication required" });
		}

		// Log form data
		const formData = await request.formData();
		logFormData("settings-reference", Object.fromEntries(formData));

		const monthlyExpensesInput = formData.get("monthlyExpenses") as string;

		devLog("settings-reference", "Saving monthly expenses", {
			userId: locals.user.id,
			inputValue: monthlyExpensesInput,
		});

		// Validate input exists
		if (!monthlyExpensesInput || monthlyExpensesInput.trim() === "") {
			devLog("settings-reference", "Validation failed: empty input");
			return fail(400, { error: "Monthly expenses amount is required" });
		}

		// Parse currency input to pence
		let amountInPence: number;
		try {
			amountInPence = parseCurrency(monthlyExpensesInput);
		} catch (err) {
			devLog("settings-reference", "Validation failed: invalid format", {
				input: monthlyExpensesInput,
				error: err instanceof Error ? err.message : "Unknown error",
			});
			return fail(400, {
				error: "Enter amount like 2000 or 2000.00",
			});
		}

		// Validate positive amount
		if (amountInPence <= 0) {
			devLog("settings-reference", "Validation failed: non-positive amount", {
				amountInPence,
			});
			return fail(400, {
				error: "Monthly expenses must be greater than 0",
			});
		}

		try {
			// Upsert to system_metadata table
			// First check if key exists
			const existing = await db
				.select({ key: systemMetadata.key })
				.from(systemMetadata)
				.where(eq(systemMetadata.key, "monthly_expenses"))
				.limit(1);

			if (existing.length > 0) {
				// Update existing row
				await db
					.update(systemMetadata)
					.set({ value: amountInPence.toString() })
					.where(eq(systemMetadata.key, "monthly_expenses"));

				devLog("settings-reference", "Updated monthly expenses", {
					amountInPence,
					userId: locals.user.id,
				});
			} else {
				// Insert new row
				await db.insert(systemMetadata).values({
					key: "monthly_expenses",
					value: amountInPence.toString(),
				});

				devLog("settings-reference", "Inserted monthly expenses", {
					amountInPence,
					userId: locals.user.id,
				});
			}

			return { success: true };
		} catch (error) {
			logError(
				"settings-reference",
				"Database error saving monthly expenses",
				error,
			);
			return fail(500, {
				error: "Failed to save monthly expenses. Please try again.",
			});
		}
	},

	/**
	 * Update tax band action
	 * Validates and updates user's UK Personal Savings Allowance tier
	 */
	updateTaxBand: async ({ request, locals }) => {
		if (!locals.user) {
			logError("settings-reference", "Authentication required for tax band update");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("settings-reference", Object.fromEntries(formData));

		const taxBand = formData.get("taxBand") as string;

		// Validate
		const validBands = ['basic', 'higher', 'additional'];
		if (!validBands.includes(taxBand)) {
			devLog("settings-reference", "Validation failed: invalid tax band", { taxBand });
			return fail(400, { error: "Invalid tax band" });
		}

		try {
			await db.update(users)
				.set({ taxBand: taxBand as 'basic' | 'higher' | 'additional' })
				.where(eq(users.id, locals.user.id));

			devLog("settings-reference", "Tax band updated", {
				userId: locals.user.id,
				taxBand
			});

			return { success: true };
		} catch (error) {
			logError("settings-reference", "Failed to update tax band", error);
			return fail(500, { error: "Failed to update tax band" });
		}
	},
};
