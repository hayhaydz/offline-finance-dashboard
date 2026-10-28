import { and, eq } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { alertAcknowledgements } from "$lib/db/schema";
import { devLog, logError } from "$lib/server/logger";
import type { Alert } from "$lib/types/alerts";

/**
 * Alert acknowledgement store (proposal #10, 2026-10-27 audit).
 *
 * Alerts are DERIVED (recomputed each load) with deterministic ids
 * `${type}:${accountSlug ?? 'global'}`, so an ack is keyed by that string
 * per user. "Done" hides the alert until it disappears and re-appears…
 * in practice forever (sentinel 2100-01-01); "Snooze 30d" hides it for
 * 30 days. Acks never mutate the underlying data — restoring is always
 * available from the /alerts page.
 */

/** Sentinel for "Done" — effectively permanent, still reversible via Restore. */
export const ACK_DONE_UNTIL = new Date("2100-01-01T00:00:00Z");

export const SNOOZE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/** Map of alertId → acknowledgedUntil for acks still active (now < until). */
export async function getActiveAlertAcks(
	userId: number,
): Promise<Map<string, Date>> {
	const rows = await db
		.select({
			alertId: alertAcknowledgements.alertId,
			acknowledgedUntil: alertAcknowledgements.acknowledgedUntil,
		})
		.from(alertAcknowledgements)
		.where(withUserFilter(userId, alertAcknowledgements));

	const now = Date.now();
	const active = new Map<string, Date>();
	for (const row of rows) {
		if (row.acknowledgedUntil.getTime() > now) {
			active.set(row.alertId, row.acknowledgedUntil);
		}
	}
	return active;
}

/** Upsert an ack for one alert. `until` = snooze deadline or ACK_DONE_UNTIL. */
export async function acknowledgeAlert(params: {
	userId: number;
	alertId: string;
	until: Date;
}): Promise<void> {
	const { userId, alertId, until } = params;
	await db
		.insert(alertAcknowledgements)
		.values({ userId, alertId, acknowledgedUntil: until })
		.onConflictDoUpdate({
			target: [alertAcknowledgements.userId, alertAcknowledgements.alertId],
			set: { acknowledgedUntil: until },
		});
	devLog("acknowledgeAlert", "Alert acknowledged", {
		userId,
		alertId,
		until: until.toISOString(),
	});
}

/** Remove an ack, returning the alert to the active list immediately. */
export async function restoreAlert(params: {
	userId: number;
	alertId: string;
}): Promise<void> {
	const { userId, alertId } = params;
	await db
		.delete(alertAcknowledgements)
		.where(
			and(
				withUserFilter(userId, alertAcknowledgements),
				eq(alertAcknowledgements.alertId, alertId),
			),
		);
	devLog("restoreAlert", "Alert restored", { userId, alertId });
}

export function snoozeUntil(now = Date.now()): Date {
	return new Date(now + SNOOZE_DAYS * MS_PER_DAY);
}

/**
 * Split alerts into (active, acknowledged). Acknowledged alerts keep their
 * `acknowledgedUntil` stamped on for UI rendering.
 */
export function partitionAcknowledged(
	alerts: Alert[],
	acks: Map<string, Date>,
): { active: Alert[]; acknowledged: Alert[] } {
	const active: Alert[] = [];
	const acknowledged: Alert[] = [];
	for (const alert of alerts) {
		const until = acks.get(alert.id);
		if (until) {
			acknowledged.push({
				...alert,
				acknowledgedUntil: until.getTime(),
			});
		} else {
			active.push(alert);
		}
	}
	return { active, acknowledged };
}

/** Filter acked alerts out in one call — used by non-alerts surfaces. */
export async function filterAcknowledgedAlerts<T extends Alert>(
	userId: number,
	alerts: T[],
): Promise<T[]> {
	try {
		const acks = await getActiveAlertAcks(userId);
		if (acks.size === 0) return alerts;
		return alerts.filter((a) => !acks.has(a.id));
	} catch (err) {
		// Ack store failure must never take the alerts surface down
		logError("filterAcknowledgedAlerts", "Failed to load acks — showing all alerts", err);
		return alerts;
	}
}
