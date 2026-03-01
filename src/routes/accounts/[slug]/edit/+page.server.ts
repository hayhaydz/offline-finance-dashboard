import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import { devLog, logError } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

// Valid account types
const VALID_ACCOUNT_TYPES = [
	"current",
	"savings",
	"investment",
	"credit-card",
	"loan",
	"mortgage",
];

// Valid tax wrapper values
const VALID_TAX_WRAPPERS = ["none", "isa", "lisa"];

// Valid liquidity values
const VALID_LIQUIDITY_VALUES = ["instant", "delayed", "locked"];

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const accountSlug = params.slug;
	devLog("editAccount", "Loading account for edit", { accountSlug });

	// Get account and validate ownership using slug
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug),
	});

	if (!account) {
		logError("editAccount", "Account not found", { accountSlug });
		error(404, "Account not found");
	}

	validateUserAccess(account, locals.user, "Account");

	if (account.closedAt) {
		logError("editAccount", "Attempt to visit edit page for closed account", {
			accountSlug,
		});
		redirect(303, `/accounts/${account.slug}`);
	}

	return {
		account,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false }, // Replace account slug with account name
			{ segmentIndex: 2, label: `Edit Account`, skipLink: false },
		],
	};
};

export const actions: Actions = {
	/**
	 * Update an existing account
	 * - Validates ownership
	 * - Server-side validation of form data
	 * - Updates account with new values
	 */
	updateAccount: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("editAccount", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const accountSlug = params.slug;

		// Validate ownership using slug
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.slug, accountSlug),
		});

		if (!account) {
			logError("editAccount", "Account not found", { accountSlug });
			return fail(404, { error: "Account not found" });
		}

		validateUserAccess(account, locals.user, "Account");

		if (account.closedAt) {
			logError("editAccount", "Attempt to edit closed account", {
				accountSlug,
			});
			return fail(403, { error: "Cannot edit a closed account." });
		}

		const formData = await request.formData();
		const name = formData.get("name") as string;
		const type = formData.get("type") as string;
		const taxWrapper = formData.get("taxWrapper") as string;
		const institution = formData.get("institution") as string | null;
		const liquidity = formData.get("liquidity") as string;

		// Validation
		if (!name?.trim()) {
			devLog("editAccount", "Validation failed - name required", {
				accountSlug,
			});
			return fail(400, { error: "Account name is required" });
		}

		if (name.trim().length > 100) {
			return fail(400, {
				error: "Account name must be 100 characters or less",
			});
		}

		if (institution && institution.trim().length > 100) {
			return fail(400, {
				error: "Institution name must be 100 characters or less",
			});
		}

		if (!VALID_ACCOUNT_TYPES.includes(type)) {
			devLog("editAccount", "Validation failed - invalid type", {
				accountSlug,
				type,
			});
			return fail(400, { error: "Invalid account type" });
		}

		if (!VALID_TAX_WRAPPERS.includes(taxWrapper)) {
			devLog("editAccount", "Validation failed - invalid tax wrapper", {
				accountSlug,
				taxWrapper,
			});
			return fail(400, { error: "Invalid tax wrapper" });
		}

		if (!VALID_LIQUIDITY_VALUES.includes(liquidity)) {
			devLog("editAccount", "Validation failed - invalid liquidity", {
				accountSlug,
				liquidity,
			});
			return fail(400, { error: "Invalid liquidity value" });
		}

		// Category: auto-calculated from type (assets vs liabilities)
		const assetTypes = new Set(["current", "savings", "investment"]);
		const category = assetTypes.has(type) ? "asset" : "liability";

		devLog("editAccount", "Form validation passed", {
			accountSlug,
			name: name.trim(),
			type,
			taxWrapper,
			category,
			institution: institution?.trim() || null,
			liquidity,
		});

		// Update account
		await db
			.update(accounts)
			.set({
				name: name.trim(),
				type: type as
					| "current"
					| "savings"
					| "investment"
					| "credit-card"
					| "loan"
					| "mortgage",
				taxWrapper: taxWrapper as "none" | "isa" | "lisa",
				category: category as "asset" | "liability",
				institution: institution?.trim() || null,
				liquidity: liquidity as "instant" | "delayed" | "locked" | null,
				updatedAt: new Date(),
			})
			.where(eq(accounts.id, account.id));

		devLog("editAccount", "Account updated successfully", {
			accountId: account.id,
			accountSlug,
		});

		devLog("editAccount", "Redirecting to account detail", { accountSlug });
		redirect(303, `/accounts/${account.slug}`);
	},
};
