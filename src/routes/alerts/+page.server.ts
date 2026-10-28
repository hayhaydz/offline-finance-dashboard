import { fail } from "@sveltejs/kit";
import {
	ACK_DONE_UNTIL,
	acknowledgeAlert,
	getActiveAlertAcks,
	restoreAlert,
	snoozeUntil,
} from "$lib/server/alert-acks";
import { getAlerts } from "$lib/server/alerts";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { sortAlerts } from "$lib/types/alerts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// Full list (acknowledged included) — this page manages acks, so it must
	// see everything and partition for display
	const [all, acks] = await Promise.all([
		getAlerts(user.id, { includeAcknowledged: true }),
		getActiveAlertAcks(user.id),
	]);

	const active = all.filter((a) => !acks.has(a.id));
	const acknowledged = all
		.filter((a) => acks.has(a.id))
		.map((a) => ({ ...a, acknowledgedUntil: acks.get(a.id)!.getTime() }));

	const sorted = sortAlerts(active);

	return {
		redAlerts: sorted.filter((a) => a.severity === "red"),
		amberAlerts: sorted.filter((a) => a.severity === "amber"),
		infoAlerts: sorted.filter((a) => a.severity === "info"),
		total: active.length,
		acknowledged: sortAlerts(acknowledged),
	};
};

export const actions: Actions = {
	// mode: "done" (hide until restored) | "snooze30" (hide 30 days)
	ack: async ({ request, locals }) => {
		const user = requireAuth(locals);
		const form = await request.formData();
		const alertId = String(form.get("alertId") ?? "");
		const mode = String(form.get("mode") ?? "done");

		if (!alertId) {
			return fail(400, { error: "Missing alert id" });
		}

		const until = mode === "snooze30" ? snoozeUntil() : ACK_DONE_UNTIL;
		await acknowledgeAlert({ userId: user.id, alertId, until });
		return { success: true };
	},
	restore: async ({ request, locals }) => {
		const user = requireAuth(locals);
		const form = await request.formData();
		const alertId = String(form.get("alertId") ?? "");

		if (!alertId) {
			return fail(400, { error: "Missing alert id" });
		}

		await restoreAlert({ userId: user.id, alertId });
		return { success: true };
	},
};
