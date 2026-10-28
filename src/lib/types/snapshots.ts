/**
 * Snapshot Type Definitions
 *
 * Central type definitions for snapshot data.
 * Extracted from server module to allow client-side imports (Svelte components).
 */

import type {
	InterestBreakdownDetail,
	ISAAllowanceBreakdown,
} from "$lib/server/snapshotBreakdowns";

/**
 * Account entry within a snapshot's accounts breakdown
 */
export interface SnapshotAccountEntry {
	accountId: number;
	accountSlug: string;
	name: string;
	type: string;
	category: "asset" | "liability";
	taxWrapper: "none" | "isa" | "lisa" | "premium-bonds";
	balanceInCents: number;
	includedInTotal: boolean;
	maturityDate: string | null;
}

/**
 * Goals entry within a snapshot's goals breakdown
 */
export interface SnapshotGoalEntry {
	goalId: number;
	goalSlug: string;
	name: string;
	goalType?: "savings" | "debt";
	targetAmountInCents: number;
	currentAllocation: number;
	isEmergencyFund: boolean;
	startingBalanceInCents?: number | null;
	/**
	 * Unified progress (P1-5): debt = paid-vs-starting, savings =
	 * allocation-vs-target. Absent on snapshots written before 2026-10-28 —
	 * consumers must fall back to the legacy fields for those rows.
	 */
	progressView?: {
		amountInCents: number;
		targetInCents: number;
		percent: number;
	};
}

/**
 * Preview data for snapshot creation, returned by calculateSnapshotData
 */
export type SnapshotPreviewData = {
	netWorth: number;
	totalAssets: number;
	totalLiabilities: number;
	totalAllocated: number;
	accountsBreakdown: {
		snapshotTakenAt: string;
		accounts: SnapshotAccountEntry[];
		totalByType: Record<string, number>;
	};
	goalsBreakdown: {
		goals: SnapshotGoalEntry[];
		totalAllocated: number;
	};
	isaBreakdown: ISAAllowanceBreakdown;
	interestBreakdownDetail: InterestBreakdownDetail;
};
