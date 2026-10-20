import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Recovery passphrase generator (spec recovery-credentials).
 *
 * CSPRNG selection from the EFF large wordlist (7,776 words) at 12 words —
 * generated, never user-invented (human-chosen passphrases are ~30 bits) and
 * never editable. Displayed exactly once at enrollment, then only the user's
 * offline paper copy holds it.
 */

const WORDLIST_FILE = join(
	dirname(fileURLToPath(import.meta.url)),
	"eff-large-wordlist.txt",
);

const WORDS = readFileSync(WORDLIST_FILE, "utf8")
	.split("\n")
	.map((w) => w.trim())
	.filter((w) => w.length > 0);

if (WORDS.length !== 7776) {
	throw new Error(
		`EFF large wordlist corrupt: expected 7776 words, got ${WORDS.length}`,
	);
}

export const RECOVERY_WORDS = 12; // ≈ 128+ bits of entropy (7776^12 ≈ 2^155)

/** Reject modulo bias by rejecting re-rolls ≥ largest multiple of 7776. */
const WORDS_MAX_UNBIASED =
	Math.floor(0x100000000 / WORDS.length) * WORDS.length;

function randomWordIndex(): number {
	// Rejection sampling over 32-bit CSPRNG values — unbiased selection.
	for (;;) {
		const value = crypto.randomBytes(4).readUInt32BE(0);
		if (value < WORDS_MAX_UNBIASED) {
			return value % WORDS.length;
		}
	}
}

/** Generate a 12-word recovery passphrase (≈128 bits, CSPRNG, unbiased). */
export function generateRecoveryPassphrase(): string {
	const words: string[] = [];
	for (let i = 0; i < RECOVERY_WORDS; i++) {
		words.push(WORDS[randomWordIndex()]);
	}
	return words.join(" ");
}

/** Normalize user-typed passphrase for verification (case/whitespace tolerant). */
export function normalizePassphrase(input: string): string {
	return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export const RECOVERY_WORD_COUNT = RECOVERY_WORDS;
