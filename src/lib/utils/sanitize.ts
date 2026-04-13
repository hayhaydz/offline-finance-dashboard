import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize user input to prevent stored XSS attacks.
 * Strips all HTML/JS tags while preserving plain text content
 * including special characters like &, <, >.
 */
export function sanitizeNoteContent(content: string): string {
	const fragment = DOMPurify.sanitize(content, {
		ALLOWED_TAGS: [], // Strip all HTML tags — notes are plain text
		ALLOWED_ATTR: [],
		RETURN_DOM_FRAGMENT: true,
	});
	return fragment.textContent || "";
}
