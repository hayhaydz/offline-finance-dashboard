/**
 * Shared time constants.
 *
 * Single source of truth for time-based calculations across the codebase.
 * All durations use consistent definitions to prevent drift.
 */

/** Milliseconds in one day */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Milliseconds in one month (30-day approximation, used throughout for consistency) */
export const MS_PER_MONTH = 30 * MS_PER_DAY;

/** Seconds in one day */
export const SECONDS_PER_DAY = 24 * 60 * 60;
