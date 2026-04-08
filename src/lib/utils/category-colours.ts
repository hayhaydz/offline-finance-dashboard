// src/lib/utils/category-colours.ts

/** Curated palette for new categories. */
export const DEFAULT_CATEGORY_PALETTE = [
	"#A0AEC0", // Gray
	"#F6AD55", // Orange
	"#FC8181", // Red
	"#63B3ED", // Blue
	"#B794F4", // Purple
	"#F687B3", // Pink
	"#FEB2B2", // Rose
	"#9AE6B4", // Green light
	"#FBD38D", // Yellow
	"#68D391", // Green
] as const;

/** Validate a hex colour string (#RRGGBB). */
export function isValidHexColour(value: string): boolean {
	return /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Monzo-inspired default categories. */
export const DEFAULT_CATEGORIES = [
	{ name: "General", key: "general", colour: "#A0AEC0" },
	{ name: "Eating Out", key: "eating_out", colour: "#F6AD55" },
	{ name: "Expenses", key: "expenses", colour: "#FC8181" },
	{ name: "Transport", key: "transport", colour: "#63B3ED" },
	{ name: "Cash", key: "cash", colour: "#B794F4" },
	{ name: "Bills", key: "bills", colour: "#F687B3" },
	{ name: "Entertainment", key: "entertainment", colour: "#FEB2B2" },
	{ name: "Shopping", key: "shopping", colour: "#9AE6B4" },
	{ name: "Holidays", key: "holidays", colour: "#FBD38D" },
	{ name: "Groceries", key: "groceries", colour: "#68D391" },
] as const;
