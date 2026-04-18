import { fail, redirect } from "@sveltejs/kit";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { goals } from "$lib/db/schema";
import {
	requireString,
	requirePositiveCurrency,
	requireDateISO,
	FIELD_LIMITS,
} from "$lib/server/validation";
import { requireAuth, getAuthUser } from "$lib/server/utils/auth-guard";
import { devLog, logError, logFormData } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	return {
		user: user,
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("goals-create", Object.fromEntries(formData));

		const name = formData.get("name") as string;
		const targetAmountStr = formData.get("target_amount") as string;
		const isEmergencyFundStr = formData.get("is_emergency_fund") as string;
		const targetDateStr = formData.get("target_date") as string;

		// Server-side validation
		const errors: Record<string, string> = {};

		const nameResult = requireString(name, "Goal name", FIELD_LIMITS.GOAL_NAME);
		if (!nameResult.ok) errors.name = nameResult.error;

		const amountResult = requirePositiveCurrency(
			targetAmountStr,
			"Target amount",
		);
		if (!amountResult.ok) {
			errors.target_amount = amountResult.error;
		}

		// Parse isEmergencyFund
		const isEmergencyFund =
			isEmergencyFundStr === "true" || isEmergencyFundStr === "1";

		// Parse target date (optional)
		let targetDate: Date | undefined;
		if (targetDateStr?.trim()) {
			const dateResult = requireDateISO(targetDateStr, "Target date");
			if (!dateResult.ok) {
				errors.target_date = dateResult.error;
			} else {
				if (dateResult.date < new Date()) {
					errors.target_date = "Target date cannot be in the past";
				} else {
					targetDate = dateResult.date;
				}
			}
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, {
				error: "Please fix errors below",
				errors,
				data: {
					name: name || "",
					targetAmount: targetAmountStr || "",
					isEmergencyFund: String(isEmergencyFund),
					targetDate: targetDateStr || "",
				},
			});
		}

		devLog("goals-create", "Validation passed", {
			name: name.trim(),
			targetAmountInCents: amountResult.ok ? amountResult.valueInCents : 0,
			isEmergencyFund,
			targetDate: targetDate?.toISOString(),
		});

		// Generate unique slug
		const slug = nanoid(16);

		// Insert new goal with currentAllocation starting at 0
		const [newGoal] = await db
			.insert(goals)
			.values({
				userId: user.id,
				slug,
				name: name.trim(),
				targetAmountInCents: amountResult.ok ? amountResult.valueInCents : 0,
				isEmergencyFund: isEmergencyFund,
				targetDate: targetDate,
				currentAllocation: 0,
			})
			.returning();

		devLog("goals-create", "Goal created", {
			goalId: newGoal.id,
			slug,
			name: newGoal.name,
		});

		// Redirect to goals list
		redirect(303, "/goals");
	},
};
