/**
 * Snapshot Type Definitions
 *
 * Central type definitions for snapshot data.
 * Extracted from server module to allow client-side imports (Svelte components).
 */

import type {
	ISAAllowanceBreakdown,
	InterestBreakdownDetail,
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
	targetAmountInCents: number;
	currentAllocation: number;
	isEmergencyFund: boolean;
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
