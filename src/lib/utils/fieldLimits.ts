// Shared field length limits — used for both server-side validation and HTML maxlength attributes
export const FIELD_LIMITS = {
	ACCOUNT_NAME: 100,
	INSTITUTION_NAME: 100,
	GOAL_NAME: 100,
	BALANCE_NOTES: 500,
	NOTE_CONTENT: 5000, // allows substantial notes
} as const;

// Display truncation limits for table cells and UI labels
export const DISPLAY_LIMITS = {
	ACCOUNT_NAME: 35,
	INSTITUTION_NAME: 25,
	GOAL_NAME: 35,
	BALANCE_NOTES: 80,
	NOTE_CONTENT: 120, // truncated preview in list
} as const;

export function truncateDisplay(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}
