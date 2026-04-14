/**
 * Generic map-reduce aggregation utility.
 *
 * Groups items by a key function, accumulates a numeric total + count,
 * and returns results sorted by total (descending) or custom comparator.
 *
 * Used by interestBreakdown and isaBreakdown for consistent aggregation
 * across account, month, institution, and tax-wrapper dimensions.
 */

/** Simple aggregated entry with key, total, and count */
export interface AggregatedEntry<K> {
	key: K;
	total: number;
	count: number;
}

/**
 * Aggregate items by key, summing a numeric value.
 *
 * Use for simple breakdowns that only need key + total + count
 * (e.g., by institution, by tax wrapper).
 *
 * @param items - Items to aggregate
 * @param keyFn - Extract grouping key from item
 * @param valueFn - Extract numeric value to sum from item
 * @returns Array of aggregated entries sorted by total descending
 */
export function aggregateByKey<T, K>(
	items: T[],
	keyFn: (item: T) => K,
	valueFn: (item: T) => number,
): AggregatedEntry<K>[] {
	const map = new Map<K, AggregatedEntry<K>>();

	for (const item of items) {
		const key = keyFn(item);
		const value = valueFn(item);
		const existing = map.get(key);

		if (existing) {
			existing.total += value;
			existing.count += 1;
		} else {
			map.set(key, { key, total: value, count: 1 });
		}
	}

	return [...map.values()].sort((a, b) => b.total - a.total);
}

/**
 * Aggregate items with custom entry shape and sorting.
 *
 * Use when aggregated entries need extra fields beyond key/total/count
 * (e.g., accountName, institution, monthName).
 *
 * @param items - Items to aggregate
 * @param keyFn - Extract grouping key from item
 * @param valueFn - Extract numeric value to sum
 * @param createEntry - Create initial entry for a new key
 * @param updateEntry - Update existing entry with new value
 * @param sortFn - Sort comparator (default: no sorting, preserve insertion order)
 * @returns Array of custom aggregated entries
 */
export function aggregateCustom<T, K, E>(
	items: T[],
	keyFn: (item: T) => K,
	valueFn: (item: T) => number,
	createEntry: (key: K, firstItem: T, value: number) => E,
	updateEntry: (entry: E, item: T, value: number) => void,
	sortFn?: (a: E, b: E) => number,
): E[] {
	const map = new Map<K, E>();

	for (const item of items) {
		const key = keyFn(item);
		const value = valueFn(item);
		const existing = map.get(key);

		if (existing) {
			updateEntry(existing, item, value);
		} else {
			map.set(key, createEntry(key, item, value));
		}
	}

	const results = [...map.values()];
	return sortFn ? results.sort(sortFn) : results;
}
