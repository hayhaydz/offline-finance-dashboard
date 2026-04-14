/**
 * Tax-free wrappers: ISA, LISA, and Premium Bonds interest is tax-free.
 * Sourced from HMRC rules. Update here when new wrappers are added.
 */
export function isTaxFreeWrapper(taxWrapper: string): boolean {
	return (
		taxWrapper === "isa" ||
		taxWrapper === "lisa" ||
		taxWrapper === "premium-bonds"
	);
}
