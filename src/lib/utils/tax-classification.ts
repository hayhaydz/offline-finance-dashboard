/**
 * Tax-free wrappers: ISA, LISA, and Premium Bonds interest is tax-free.
 * Sourced from HMRC rules. Update TAX_FREE_WRAPPERS when new wrappers are added.
 */
import { TAX_FREE_WRAPPERS } from "$lib/utils/domain-constants";

export function isTaxFreeWrapper(taxWrapper: string): boolean {
	return (TAX_FREE_WRAPPERS as readonly string[]).includes(taxWrapper);
}
