import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { systemMetadata, users } from "$lib/db/schema";
import { parseCurrency } from "$lib/utils/currency";
import { isValidHexColour } from "$lib/utils/category-colours";
import { getCategories, createCategory, updateCategory, deleteCategory } from "$lib/server/categories";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import { devLog, isVerboseDebug, logError, logFormData } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	if (isVerboseDebug()) {
		devLog("settings-general", "General settings page loaded", {
			username: user.username,
			userId: user.id,
		});
	}

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
	const userRow = await db.query.users.findFirst({
		where: eq(users.id, user.id),
		columns: { taxBand: true },
	});

	// Fetch spending categories
	const categories = await getCategories(user.id);

	return {
		monthlyExpensesInPence,
		taxBand: userRow?.taxBand ?? "basic",
		categories,
	};
};

export const actions: Actions = {
	/**
	 * Save monthly expenses action
	 * Validates input, converts to pence, and stores in system_metadata table
	 */
	saveMonthlyExpenses: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("settings-general", Object.fromEntries(formData));

		const monthlyExpensesInput = formData.get("monthlyExpenses") as string;

		devLog("settings-general", "Saving monthly expenses", {
			userId: user.id,
			inputValue: monthlyExpensesInput,
		});

		if (!monthlyExpensesInput || monthlyExpensesInput.trim() === "") {
			devLog("settings-general", "Validation failed: empty input");
			return fail(400, { error: "Monthly expenses amount is required" });
		}

		let amountInPence: number;
		try {
			amountInPence = parseCurrency(monthlyExpensesInput);
		} catch (err) {
			devLog("settings-general", "Validation failed: invalid format", {
				input: monthlyExpensesInput,
				error: err instanceof Error ? err.message : "Unknown error",
			});
			return fail(400, {
				error: "Enter amount like 2000 or 2000.00",
			});
		}

		if (amountInPence <= 0) {
			devLog("settings-general", "Validation failed: non-positive amount", {
				amountInPence,
			});
			return fail(400, {
				error: "Monthly expenses must be greater than 0",
			});
		}

		try {
			const existing = await db
				.select({ key: systemMetadata.key })
				.from(systemMetadata)
				.where(eq(systemMetadata.key, "monthly_expenses"))
				.limit(1);

			if (existing.length > 0) {
				await db
					.update(systemMetadata)
					.set({ value: amountInPence.toString() })
					.where(eq(systemMetadata.key, "monthly_expenses"));

				devLog("settings-general", "Updated monthly expenses", {
					amountInPence,
					userId: user.id,
				});
			} else {
				await db.insert(systemMetadata).values({
					key: "monthly_expenses",
					value: amountInPence.toString(),
				});

				devLog("settings-general", "Inserted monthly expenses", {
					amountInPence,
					userId: user.id,
				});
			}

			return { success: true };
		} catch (error) {
			logError("settings-general", "Database error saving monthly expenses", error);
			return fail(500, {
				error: "Failed to save monthly expenses. Please try again.",
			});
		}
	},

	/**
	 * Update tax band action
	 */
	updateTaxBand: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("settings-general", Object.fromEntries(formData));

		const taxBand = formData.get("taxBand") as string;

		const validBands = ["basic", "higher", "additional"];
		if (!validBands.includes(taxBand)) {
			devLog("settings-general", "Validation failed: invalid tax band", { taxBand });
			return fail(400, { error: "Invalid tax band" });
		}

		try {
			await db
				.update(users)
				.set({ taxBand: taxBand as "basic" | "higher" | "additional" })
				.where(eq(users.id, user.id));

			devLog("settings-general", "Tax band updated", {
				userId: user.id,
				taxBand,
			});

			return { success: true };
		} catch (error) {
			logError("settings-general", "Failed to update tax band", error);
			return fail(500, { error: "Failed to update tax band" });
		}
	},

	/**
	 * Create a new spending category
	 */
	createCategory: async ({ request, locals }) => {
		devLog("settings-general:createCategory", "Action invoked");

		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const name = formData.get("name") as string;
		const key = formData.get("key") as string;
		const colour = formData.get("colour") as string;

		devLog("settings-general:createCategory", "Form data received", { name, key, colour });

		if (!name?.trim()) {
			devLog("settings-general:createCategory", "Validation failed: empty name");
			return fail(400, { error: "Name is required" });
		}
		if (!key?.trim()) {
			devLog("settings-general:createCategory", "Validation failed: empty key");
			return fail(400, { error: "Key is required" });
		}
		if (!colour || !isValidHexColour(colour)) {
			devLog("settings-general:createCategory", "Validation failed: invalid colour", { colour });
			return fail(400, { error: "Valid hex colour is required (e.g. #3B82F6)" });
		}

		try {
			const result = await createCategory({
				userId: user.id,
				name: name.trim(),
				key: key.trim(),
				colour,
			});

			devLog("settings-general:createCategory", "Result", { ok: result.ok });

			if (!result.ok) {
				return fail(400, { error: result.error });
			}

			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to create category";
			logError("settings-general:createCategory", message);
			return fail(400, { error: message });
		}
	},

	/**
	 * Update an existing spending category
	 */
	updateCategory: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const slug = formData.get("slug") as string;
		const name = formData.get("name") as string;
		const colour = formData.get("colour") as string;

		if (!slug) {
			return fail(400, { error: "Category slug is required" });
		}

		try {
			const result = await updateCategory(slug, user.id, {
				name: name?.trim() || undefined,
				colour: colour && isValidHexColour(colour) ? colour : undefined,
			});

			if (!result.ok) {
				return fail(400, { error: result.error });
			}

			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update category";
			logError("settings-general:updateCategory", message);
			return fail(400, { error: message });
		}
	},

	/**
	 * Delete (soft) a spending category
	 */
	deleteCategory: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const slug = formData.get("slug") as string;

		if (!slug) {
			return fail(400, { error: "Category slug is required" });
		}

		try {
			const result = await deleteCategory(slug, user.id);

			if (!result.ok) {
				return fail(400, { error: result.error });
			}

			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to delete category";
			logError("settings-general:deleteCategory", message);
			return fail(400, { error: message });
		}
	},
};
