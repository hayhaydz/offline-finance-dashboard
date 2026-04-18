import { fail, redirect } from "@sveltejs/kit";
import { nanoid } from "nanoid";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import {
	requireString,
	optionalString,
	requireEnum,
	requireCurrency,
	VALID_ACCOUNT_TYPES,
	VALID_TAX_WRAPPERS,
	VALID_LIQUIDITY,
	FIELD_LIMITS,
} from "$lib/server/validation";
import { devLog, isVerboseDebug, logError, logFormData } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	return {
		user: {
			id: user.id,
			username: user.username,
			createdAt: user.createdAt,
		},
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		try {
			const user = getAuthUser(locals);
			if (!user) {
				return fail(401, { error: "Authentication required" });
			}

			const formData = await request.formData();
			if (isVerboseDebug()) devLog("createAccount", "Form received", Object.fromEntries(formData));

			const name = formData.get("name") as string;
			const type = formData.get("type") as string;
			const taxWrapper = formData.get("taxWrapper") as string;
			const institution = formData.get("institution") as string;
			const liquidity = formData.get("liquidity") as string;
			const initialBalance = formData.get("initialBalance") as string;

			// Server-side validation
			const errors: Record<string, string> = {};

			const nameResult = requireString(
				name,
				"Account name",
				FIELD_LIMITS.ACCOUNT_NAME,
			);
			if (!nameResult.ok) errors.name = nameResult.error;

			const typeResult = requireEnum(type, VALID_ACCOUNT_TYPES, "Account type");
			if (!typeResult.ok) errors.type = typeResult.error;

			const taxWrapperResult = requireEnum(
				taxWrapper,
				VALID_TAX_WRAPPERS,
				"Tax wrapper",
			);
			if (!taxWrapperResult.ok) errors.taxWrapper = taxWrapperResult.error;

			// Category: auto-calculated from type (assets vs liabilities)
			const assetTypes = new Set(["current", "savings", "investment"]);
			const category = assetTypes.has(type) ? "asset" : "liability";

			const institutionResult = optionalString(
				institution,
				"Institution name",
				FIELD_LIMITS.INSTITUTION_NAME,
			);
			if (!institutionResult.ok) errors.institution = institutionResult.error;

			if (liquidity) {
				const liquidityResult = requireEnum(
					liquidity,
					VALID_LIQUIDITY,
					"Liquidity option",
				);
				if (!liquidityResult.ok) errors.liquidity = liquidityResult.error;
			}

			// Initial balance: optional
			let balanceInCents: number | null = null;
			if (initialBalance?.trim()) {
				const balanceResult = requireCurrency(initialBalance, "Balance");
				if (!balanceResult.ok) {
					errors.initialBalance = balanceResult.error;
				} else {
					balanceInCents = balanceResult.valueInCents;
				}
			}

			// Return validation errors if any
			if (Object.keys(errors).length > 0) {
				devLog("createAccount", "Validation failed", { errors });
				logFormData("createAccount", {
					name,
					type,
					taxWrapper,
					institution,
					liquidity,
					initialBalance,
				});
				return fail(400, {
					error: "Please fix the errors below",
					errors,
					data: {
						name: name || "",
						type: type || "",
						taxWrapper: taxWrapper || "none",
						institution: institution || "",
						liquidity: liquidity || "",
						initialBalance: initialBalance || "",
					},
				});
			}

			if (isVerboseDebug()) {
				devLog("createAccount", "Validation passed", {
					name: name.trim(),
					type,
					taxWrapper,
					category,
					institution: institution?.trim() || null,
					liquidity: liquidity || null,
					balanceInCents,
				});
			}

			// Insert account with user_id for row-level security and slug
			const accountSlug = nanoid(16);
			const [newAccount] = await db
				.insert(accounts)
				.values({
					userId: user.id,
					slug: accountSlug,
					name: name.trim(),
					type: type as
						| "current"
						| "savings"
						| "investment"
						| "credit-card"
						| "loan"
						| "mortgage",
					taxWrapper: taxWrapper as "none" | "isa" | "lisa" | "premium-bonds",
					category: category as "asset" | "liability",
					institution: institution?.trim() || null,
					liquidity:
						(liquidity as "instant" | "delayed" | "locked" | null) || null,
					closedAt: null,
					excludedFromNetWorth: false,
				})
				.returning();

			if (isVerboseDebug()) {
				devLog("createAccount", "Account created", {
					accountId: newAccount.id,
					slug: accountSlug,
				});
			}

			// If initial balance provided, create an opening deposit transaction.
			if (balanceInCents !== null) {
				// Use midnight UTC for consistent date comparison
				const todayMidnight = new Date();
				todayMidnight.setUTCHours(0, 0, 0, 0);
				await db.insert(accountTransactions).values({
					accountId: newAccount.id,
					slug: nanoid(21),
					type: "deposit",
					amount: balanceInCents,
					description: "Opening balance",
					categoryId: null,
					transactionDate: todayMidnight,
					createdAt: new Date(),
				});
				if (isVerboseDebug()) {
					devLog("createAccount", "Opening transaction added", {
						accountId: newAccount.id,
						amountInCents: balanceInCents,
						transactionDate: todayMidnight.toISOString(),
					});
				}
			}

			// Redirect to accounts list on success
			if (isVerboseDebug()) devLog("createAccount", "Redirecting to accounts list", { accountSlug });
			redirect(303, "/accounts");
		} catch (error) {
			// SvelteKit's redirect() throws an error with status code - let it through
			if (
				error &&
				typeof error === "object" &&
				"status" in error &&
				error.status === 303
			) {
				throw error; // Re-throw redirect exceptions
			}
			logError("createAccount", "Unexpected error", error);
			return fail(500, {
				error: "An error occurred while creating the account",
			});
		}
	},
};
