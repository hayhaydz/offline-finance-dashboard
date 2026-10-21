import crypto from "node:crypto";

/**
 * Session tokens are stored ONLY as SHA-256 hashes (auth-session-hardening
 * spec: a stolen database file yields no usable tokens). The browser holds
 * the raw random token in the `session` cookie; every DB read/write of
 * `sessions.token` goes through this helper — insert the hash, and hash the
 * presented cookie value before lookup.
 */
export function hashSessionToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}
