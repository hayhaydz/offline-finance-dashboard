import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Post-purge invariant (unlock-ceremony delta, drop-totp-2fa):
 * the system never verifies a factor it can generate itself — no TOTP,
 * backup-code, or other server-verifiable code factor may exist in
 * production code. Migration SQL files are exempt (they carry the DROP
 * statements and historical baselines that name the removed objects).
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
	/otplib/i,
	/totpSecret/i,
	/totp_secret/i,
	/backup_codes/i,
	/backupCodes\b/,
	/mfa-setup/i,
	/mfaSetupToken/i,
];

const SCAN_ROOTS = ["src", "scripts"];
const SKIP_DIRS = new Set(["migrations", "node_modules", ".svelte-kit"]);

function collectFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			collectFiles(join(dir, entry.name), out);
		} else if (entry.isFile()) {
			out.push(join(dir, entry.name));
		}
	}
	return out;
}

describe("TOTP purge invariant (unlock-ceremony)", () => {
	it("production code contains no TOTP/backup-code/MFA references", () => {
		const offenders: string[] = [];
		for (const root of SCAN_ROOTS) {
			for (const file of collectFiles(root)) {
				const content = readFileSync(file, "utf8");
				for (const pattern of FORBIDDEN_PATTERNS) {
					if (pattern.test(content)) offenders.push(`${file} matches ${pattern}`);
				}
			}
		}
		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("package.json no longer declares otplib or qrcode", () => {
		const pkg = readFileSync("package.json", "utf8");
		expect(pkg).not.toMatch(/"otplib"/);
		expect(pkg).not.toMatch(/"qrcode"/);
		expect(pkg).not.toMatch(/"@types\/qrcode"/);
	});
});
