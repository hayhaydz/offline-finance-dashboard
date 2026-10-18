/**
 * Validates a `redirectTo` value captured from a URL query parameter.
 *
 * Returns the sanitized path, or `null` when the value is absent, is not a
 * same-origin app path, or points at an auth route (which would redirect
 * loop after login). Shared by the server hooks and the login action.
 */
export function sanitizeRedirectTo(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	if (!value.startsWith("/")) return null;
	// Reject protocol-relative and backslash tricks (open-redirect vectors).
	if (value.startsWith("//") || value.startsWith("/\\")) return null;
	if (value.includes("\n") || value.includes("\r")) return null;
	if (
		value.startsWith("/login") ||
		value.startsWith("/register") ||
		value.startsWith("/mfa-setup")
	) {
		return null;
	}
	return value;
}
