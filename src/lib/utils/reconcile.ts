// src/lib/utils/reconcile.ts

import type { TransactionType } from "$lib/utils/domain-constants";

/**
 * Bulk balance reconciliation (#16): mapping from a desired balance delta
 * to the transaction type that expresses it, per account category.
 *
 * Balances are derived from transactions (source of truth), so "setting" a
 * balance = appending one reconciling transaction:
 *   asset, delta > 0  → deposit    (money appeared)
 *   asset, delta < 0  → withdrawal (money gone)
 *   liability, delta < 0 → charge  (debt grew)
 *   liability, delta > 0 → payment (debt repaid)
 * Signs are normalised downstream by NEGATIVE_AMOUNT_TYPES rules; the
 * caller passes the ABSOLUTE delta in pence.
 */
export type ReconcilePlan =
	| { kind: "skip"; reason: "zero-delta" | "too-small" }
	| { kind: "create"; type: TransactionType; amountPence: number };

export const MIN_RECONCILE_DELTA_PENCE = 1;

export function planReconciliation(
	accountCategory: string,
	deltaPence: number,
): ReconcilePlan {
	if (deltaPence === 0) return { kind: "skip", reason: "zero-delta" };
	const abs = Math.abs(deltaPence);
	if (abs < MIN_RECONCILE_DELTA_PENCE) {
		return { kind: "skip", reason: "too-small" };
	}
	const isLiability = accountCategory === "liability";
	if (deltaPence > 0) {
		return {
			kind: "create",
			type: isLiability ? "payment" : "deposit",
			amountPence: abs,
		};
	}
	return {
		kind: "create",
		type: isLiability ? "charge" : "withdrawal",
		amountPence: abs,
	};
}

/** 35-day staleness threshold, shared with the accounts list dots (#17). */
export const STALE_DAYS = 35;

export function isStaleBalance(lastUpdated: Date | null, now = new Date()): boolean {
	if (!lastUpdated) return true;
	const cutoff = now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000;
	return new Date(lastUpdated).getTime() < cutoff;
}
