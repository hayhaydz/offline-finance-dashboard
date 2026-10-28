import { describe, expect, it } from "vitest";
import type { Alert } from "$lib/types/alerts";
import {
	ACK_DONE_UNTIL,
	partitionAcknowledged,
	snoozeUntil,
} from "$lib/server/alert-acks";

// Proposal #10 (2026-10-27 audit): per-user per-alert acknowledgements.
// Pure-function coverage — the DB paths are exercised live (see progress ev).

const mkAlert = (id: string, overrides: Partial<Alert> = {}): Alert => ({
	id,
	type: "BUDGET_OVERSPEND",
	severity: "red",
	title: "Monthly budget exceeded",
	message: "Spent too much",
	triggeredAt: Date.now(),
	...overrides,
});

describe("alert acknowledgements (#10)", () => {
	it("snoozeUntil is 30 days out", () => {
		const now = new Date("2026-10-28T12:00:00Z").getTime();
		const until = snoozeUntil(now);
		expect(until.getTime() - now).toBe(30 * 86_400_000);
		expect(until.toISOString().slice(0, 10)).toBe("2026-11-27");
	});

	it("ACK_DONE_UNTIL sentinel is far future (year 2100)", () => {
		expect(ACK_DONE_UNTIL.getUTCFullYear()).toBe(2100);
	});

	it("partitionAcknowledged splits active vs acked and stamps until", () => {
		const a = mkAlert("A:global");
		const b = mkAlert("B:x");
		const until = new Date("2026-11-27T00:00:00Z");
		const { active, acknowledged } = partitionAcknowledged([a, b], new Map([
			["A:global", until],
		]));
		expect(active.map((x) => x.id)).toEqual(["B:x"]);
		expect(acknowledged.map((x) => x.id)).toEqual(["A:global"]);
		expect(acknowledged[0].acknowledgedUntil).toBe(until.getTime());
		expect(active[0].acknowledgedUntil).toBeUndefined();
	});

	it("empty ack map returns everything active", () => {
		const a = mkAlert("A:global");
		const { active, acknowledged } = partitionAcknowledged([a], new Map());
		expect(active).toHaveLength(1);
		expect(acknowledged).toHaveLength(0);
	});

	it("ack keyed by alert id only — same type different account stays active", () => {
		const visa = mkAlert("STALE_BALANCE:visa");
		const hsbc = mkAlert("STALE_BALANCE:hsbc");
		const { active, acknowledged } = partitionAcknowledged(
			[visa, hsbc],
			new Map([["STALE_BALANCE:visa", ACK_DONE_UNTIL]]),
		);
		expect(acknowledged.map((x) => x.id)).toEqual(["STALE_BALANCE:visa"]);
		expect(active.map((x) => x.id)).toEqual(["STALE_BALANCE:hsbc"]);
	});
});
