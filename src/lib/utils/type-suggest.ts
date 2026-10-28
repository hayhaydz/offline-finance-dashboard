// src/lib/utils/type-suggest.ts

/**
 * Description→transaction-type auto-suggest (Phase 9 polish, harvested
 * from the Phase 3 gate review).
 *
 * A spending-like description (one that matches a #14 category keyword
 * rule) almost always belongs to a WITHDRAWAL — but the creator's type
 * select defaults to the first offered option (usually `deposit`), and a
 * spending txn filed as anything other than withdrawal/charge/refund is
 * INVISIBLE to budgets (BUDGET_SPENDING_TYPES). This hint closes that
 * trap: suggest the first budget-visible spending type the account offers.
 *
 * Pure — mirrors category-suggest's contract: no match → null, never guess.
 * "User already chose a type" is component state (typeTouched), not a
 * util concern.
 */

import { suggestCategoryForDescription } from "./category-suggest";
import type { TransactionType } from "./domain-constants";

/** Budget-visible spending types, most-typical first. */
const SPENDING_TYPE_CANDIDATES: readonly TransactionType[] = [
	"withdrawal",
	"charge",
];

export function suggestSpendingType(
	description: string,
	categories: Array<{ id: number; name: string }>,
	creatableTypes: readonly TransactionType[],
): TransactionType | null {
	if (!suggestCategoryForDescription(description, categories)) return null;
	return SPENDING_TYPE_CANDIDATES.find((t) => creatableTypes.includes(t)) ?? null;
}
