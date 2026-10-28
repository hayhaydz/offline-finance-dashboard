// src/lib/utils/category-suggest.ts

/**
 * Client-side description→category auto-suggest (proposal #14).
 *
 * Pure substring/regex rules — no ML, no server round-trip. Rules are keyed
 * by category NAME (case-insensitive) so they work with the seeded default
 * categories and any user-created category that reuses the name. No match
 * → null: never guess a wrong category over leaving it unassigned.
 */

export interface SuggestableCategory {
	id: number;
	name: string;
}

interface SuggestRule {
	name: string;
	/** Lowercase substrings/regex sources tested against the description. */
	patterns: RegExp[];
}

/** Ordered most-specific first — the first matching rule wins. */
export const CATEGORY_SUGGEST_RULES: readonly SuggestRule[] = [
	{
		name: "Groceries",
		patterns: [
			/tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|iceland|co-?op\b|supermarket|grocer/,
		],
	},
	{
		name: "Eating Out",
		patterns: [
			/restaurant|café|cafe|coffee|starbucks|costa|pret|mcdonald|kfc|nando|takeaway|takeaway|deliveroo|just ?eat|uber ?eats|domino|pizza|kebab|chip(y|pie)|pub\b|lunch|brunch|dinner/,
		],
	},
	{
		name: "Transport",
		patterns: [
			/uber\b|lyft|train|national rail|tfl|tube\b|bus\b|oyster|petrol|fuel|shell\b|esso|texaco|bp\b|parking|taxi|cab\b/,
		],
	},
	{
		name: "Holidays",
		patterns: [
			/flight|airline|easyjet|ryanair|british airways|hotel|airbnb|booking\.com|holiday|travel insurance|airport/,
		],
	},
	{
		name: "Entertainment",
		patterns: [
			/netflix|spotify|cinema|odeon|vue\b|theatre|gig\b|concert|xbox|playstation|steam\b|nintendo|game( |stop)|disney\+|prime video/,
		],
	},
	{
		name: "Bills",
		patterns: [
			/rent\b|mortgage|council tax|electric|gas bill|gas supp|water bill|severn trent|thames water|broadband|virgin media|bt\b|sky\b|ee\b|o2\b|vodafone|three\b|mobile phone|phone bill|tv licence|insurance|aa\b|rscpa|nspcc/,
		],
	},
	{
		name: "Shopping",
		patterns: [
			/amazon|ebay|argos|ikea|john lewis|currys|next\b|zara|h&m|uniqlo|primark|m&s|boots\b|superdrug|b&q|homebase|depot\b/,
		],
	},
	{
		name: "Cash",
		patterns: [/cash ?withdrawal|atm\b|cashback|cash withdrawal/],
	},
];

/**
 * Suggest a category for a transaction description.
 * Returns the matched category from `categories` (matched by name,
 * case-insensitive) or null when nothing matches.
 */
export function suggestCategoryForDescription(
	description: string,
	categories: SuggestableCategory[],
): SuggestableCategory | null {
	const haystack = description.trim().toLowerCase();
	if (!haystack) return null;

	for (const rule of CATEGORY_SUGGEST_RULES) {
		if (rule.patterns.some((p) => p.test(haystack))) {
			const match = categories.find(
				(cat) => cat.name.toLowerCase() === rule.name.toLowerCase(),
			);
			if (match) return match;
		}
	}
	return null;
}

/** Derive a URL-safe category key from a display name ("Eating Out" → "eating_out"). */
export function categoryKeyFromName(name: string): string {
	const key = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
	return key;
}
