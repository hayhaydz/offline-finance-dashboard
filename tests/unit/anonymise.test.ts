import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
	AnonymiseError,
	runAnonymise,
	selfCheck,
	shiftTaxYear,
	TABLE_RULES,
	verifyCoverage,
} from "../../scripts/anonymise";
import {
	decryptValue,
	encryptValue,
} from "../../src/lib/server/crypto/value-codec";

const MIGRATIONS_DIR = path.resolve("src/lib/db/migrations");
const tempDirs: string[] = [];

function makeTmpDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function ts(date: string, time = "12:00:00"): number {
	return Math.floor(new Date(`${date}T${time}Z`).getTime() / 1000);
}

/** Builds a source DB with the real migration schema + a month-boundary fixture. */
function buildFixtureDb(filePath: string): void {
	const db = new Database(filePath);
	for (const file of fs
		.readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort()) {
		const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
		for (const stmt of sql.split("--> statement-breakpoint")) {
			if (stmt.trim()) db.exec(stmt);
		}
	}

	db.prepare(
		"INSERT INTO users (username, password_hash, password_salt, tax_band, inactivity_timeout, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
	).run(
		"someone",
		"realhash",
		"realsalt",
		"basic",
		5,
		ts("2026-01-01"),
		ts("2026-01-01"),
	);

	db.prepare(
		"INSERT INTO accounts (slug, user_id, name, institution, type, tax_wrapper, category, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
	).run(
		"real-slug-a",
		1,
		"Main Current",
		"HSBC",
		"current",
		"none",
		"asset",
		ts("2026-01-01"),
		ts("2026-01-01"),
	);

	const insertTx = db.prepare(
		"INSERT INTO account_transactions (slug, account_id, type, amount, description, transaction_date, created_at) VALUES (?,?,?,?,?,?,?)",
	);
	// Month-boundary fixture: a month whose rows straddle a page boundary,
	// plus zeros and both amount signs.
	insertTx.run(
		"t1",
		1,
		"deposit",
		250000,
		"Salary January",
		ts("2026-01-05", "09:00:00"),
		ts("2026-01-05"),
	);
	insertTx.run(
		"t2",
		1,
		"withdrawal",
		-12500,
		"Weekly shop",
		ts("2026-01-20", "21:15:00"),
		ts("2026-01-20"),
	);
	insertTx.run(
		"t3",
		1,
		"withdrawal",
		-4800,
		"Another shop",
		ts("2026-01-30", "08:45:00"),
		ts("2026-01-30"),
	);
	insertTx.run(
		"t4",
		1,
		"withdrawal",
		-9900,
		"Late purchase",
		ts("2026-01-31", "23:59:59"),
		ts("2026-01-31"),
	);
	insertTx.run(
		"t5",
		1,
		"refund",
		0,
		"Zero refund",
		ts("2026-02-01", "00:00:01"),
		ts("2026-02-01"),
	);

	db.prepare(
		"INSERT INTO snapshots (slug, user_id, snapshot_date, net_worth_in_cents, total_assets_in_cents, total_liabilities_in_cents, total_allocated_in_cents, accounts_breakdown, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
	).run(
		"snap-a",
		1,
		"2026-01-31",
		237500,
		500000,
		262500,
		10000,
		JSON.stringify({
			snapshotTakenAt: "2026-01-31T18:00:00.000Z",
			accounts: [
				{
					accountId: 1,
					accountSlug: "real-slug-a",
					name: "Main Current",
					type: "current",
					balanceInCents: 245000,
					includedInTotal: true,
					maturityDate: null,
				},
			],
		}),
		ts("2026-01-31"),
	);

	db.prepare(
		"INSERT INTO tax_band_history (user_id, band, from_tax_year, to_tax_year, created_at, updated_at) VALUES (?,?,?,?,?,?)",
	).run(1, "basic", "2025/26", null, ts("2026-01-01"), ts("2026-01-01"));

	// Adjacent months exercise the transient unique-index hazard: an in-place
	// whole-month shift collides unless rows are updated in descending order.
	const insertIncome = db.prepare(
		"INSERT INTO income_history (user_id, month, gross_income_in_cents, note, created_at, updated_at) VALUES (?,?,?,?,?,?)",
	);
	insertIncome.run(
		1,
		"2025-11",
		350000,
		"November pay",
		ts("2025-12-01"),
		ts("2025-12-01"),
	);
	insertIncome.run(
		1,
		"2025-12",
		350000,
		"December pay",
		ts("2026-01-01"),
		ts("2026-01-01"),
	);
	insertIncome.run(
		1,
		"2026-01",
		410000,
		"January pay",
		ts("2026-02-01"),
		ts("2026-02-01"),
	);

	db.prepare(
		"INSERT INTO monthly_reviews (slug, user_id, year_month, completed_items, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
	).run(
		"review-a",
		1,
		"2026-01",
		'["items-reviewed"]',
		"Went fine",
		ts("2026-02-01"),
		ts("2026-02-01"),
	);
	db.prepare(
		"INSERT INTO monthly_reviews (slug, user_id, year_month, completed_items, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
	).run(
		"review-b",
		1,
		"2025-12",
		"[]",
		null,
		ts("2026-01-01"),
		ts("2026-01-01"),
	);

	db.prepare(
		"INSERT INTO budget_months (user_id, month, total_target_in_cents, excluded_category_ids, excluded_account_ids, excluded_types, category_targets, created_at) VALUES (?,?,?,?,?,?,?,?)",
	).run(
		1,
		"2026-01",
		150000,
		"[1,2]",
		"[]",
		'["transfer_in"]',
		JSON.stringify({ 5: 40000, 7: 25000 }),
		ts("2026-01-01"),
	);

	db.close();
}

function dumpLogical(filePath: string): string {
	const db = new Database(filePath, { readonly: true });
	const tables = (
		db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
			)
			.all() as Array<{ name: string }>
	)
		.map((r) => r.name)
		.filter((t) => !t.startsWith("sqlite_") && !t.startsWith("__"));
	const parts: string[] = [];
	for (const t of tables) {
		const rows = db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all();
		parts.push(`${t}: ${JSON.stringify(rows)}`);
	}
	db.close();
	return parts.join("\n");
}

function allTx(filePath: string) {
	const db = new Database(filePath, { readonly: true });
	const rows = db
		.prepare(
			"SELECT slug, amount, transaction_date FROM account_transactions ORDER BY id",
		)
		.all() as Array<{ slug: string; amount: number; transaction_date: number }>;
	db.close();
	return rows;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("anonymise — determinism", () => {
	it("produces identical output for the same source and seed", async () => {
		const dir = makeTmpDir("anon-det-");
		const source = path.join(dir, "source.db");
		const out1 = path.join(dir, "out1.db");
		const out2 = path.join(dir, "out2.db");
		buildFixtureDb(source);

		const r1 = await runAnonymise({ source, out: out1, seed: "repro-1" });
		const r2 = await runAnonymise({ source, out: out2, seed: "repro-1" });

		expect(r1.monthOffset).toBe(r2.monthOffset);
		expect(dumpLogical(out1)).toBe(dumpLogical(out2));
	});

	it("different seeds produce different outputs", async () => {
		const dir = makeTmpDir("anon-diff-");
		const source = path.join(dir, "source.db");
		buildFixtureDb(source);
		const out1 = path.join(dir, "a.db");
		const out2 = path.join(dir, "b.db");
		await runAnonymise({ source, out: out1, seed: "seed-a" });
		await runAnonymise({ source, out: out2, seed: "seed-b" });
		expect(dumpLogical(out1)).not.toBe(dumpLogical(out2));
	});
});

describe("anonymise — month-boundary shape preservation", () => {
	it("keeps every transaction of a source month inside one output month", async () => {
		const dir = makeTmpDir("anon-shape-");
		const { out } = await runFixture(dir, "shape-1");

		const rows = allTx(out);
		expect(rows).toHaveLength(5);
		const months = rows.map((r) =>
			new Date(r.transaction_date * 1000).toISOString().slice(0, 7),
		);
		// t1..t4 are January; t5 is February. January must stay a single month,
		// February a single (different) month — the boundary never splits.
		const jan = months.slice(0, 4);
		expect(new Set(jan).size).toBe(1);
		expect(months[4]).not.toBe(jan[0]);
	});

	it("preserves day-of-month (≤28) and time-of-day exactly", async () => {
		const { out } = await runFixture(makeTmpDir("anon-day-"), "shape-2");
		const rows = allTx(out);
		const iso = (i: number) =>
			new Date(rows[i].transaction_date * 1000).toISOString();
		// t1: 2026-01-05T09:00:00 — day ≤ 28 so no clamping can occur
		expect(iso(0).slice(8)).toBe("05T09:00:00.000Z");
		// within-month interval between t1 (Jan 5) and t2 (Jan 20) is exact
		expect(rows[1].transaction_date - rows[0].transaction_date).toBe(
			(20 - 5) * 86400 + (21 * 3600 + 15 * 60) - 9 * 3600,
		);
	});
});

describe("anonymise — amount invariants", () => {
	it("preserves sign, keeps zeros, stays within ±5% (pence-rounded)", async () => {
		const { out } = await runFixture(makeTmpDir("anon-amt-"), "amounts-1");
		const rows = allTx(out);
		const originals = [250000, -12500, -4800, -9900, 0];
		expect(rows).toHaveLength(originals.length);
		rows.forEach((row, i) => {
			const original = originals[i];
			expect(row.amount === 0).toBe(original === 0);
			expect(Math.sign(row.amount)).toBe(Math.sign(original));
			if (original !== 0) {
				const tolerance = Math.max(1, Math.ceil(Math.abs(original) * 0.05));
				expect(Math.abs(row.amount - original)).toBeLessThanOrEqual(tolerance);
			}
		});
	});
});

describe("anonymise — identity transforms", () => {
	it("renames names/usernames, regenerates slugs, and keeps JSON breakdowns consistent", async () => {
		const { out } = await runFixture(makeTmpDir("anon-id-"), "identity-1");
		const db = new Database(out, { readonly: true });

		const account = db
			.prepare("SELECT slug, name, institution FROM accounts")
			.get() as {
			slug: string;
			name: string;
			institution: string;
		};
		expect(account.slug).not.toBe("real-slug-a");
		expect(account.slug).toMatch(/^[A-Za-z0-9_-]{21}$/);
		expect(account.name).not.toBe("Main Current");
		expect(account.name.split(/\s+/)).toHaveLength(2); // word count preserved
		expect(account.institution).not.toBe("HSBC");

		const user = db
			.prepare("SELECT username, password_salt, password_hash FROM users")
			.get() as {
			username: string;
			password_hash: string;
			password_salt: string;
		};
		expect(user.username).not.toBe("someone");
		expect(user.password_salt).not.toBe("realsalt");
		expect(user.password_hash).not.toBe("realhash");

		const snapshot = db
			.prepare("SELECT accounts_breakdown FROM snapshots")
			.get() as {
			accounts_breakdown: string;
		};
		const breakdown = JSON.parse(snapshot.accounts_breakdown);
		expect(breakdown.accounts[0].accountSlug).toBe(account.slug); // JSON slug ↔ row slug
		expect(breakdown.accounts[0].name).toBe(account.name); // JSON name ↔ row name
		expect(breakdown.accounts[0].accountId).toBe(1); // ids are structural — never touched
		expect(breakdown.accounts[0].balanceInCents).not.toBe(245000); // jittered
		db.close();
	});

	it("shifts text dates and tax years canonically", async () => {
		const { out } = await runFixture(makeTmpDir("anon-ty-"), "taxyear-1");
		const db = new Database(out, { readonly: true });
		const budget = db
			.prepare(
				"SELECT month, excluded_category_ids, category_targets FROM budget_months",
			)
			.get() as {
			month: string;
			excluded_category_ids: string;
			category_targets: string;
		};
		expect(budget.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
		expect(budget.month).not.toBe("2026-01");
		expect(JSON.parse(budget.excluded_category_ids)).toEqual([1, 2]); // ids kept
		const targets = JSON.parse(budget.category_targets) as Record<
			string,
			number
		>;
		expect(Object.keys(targets).sort()).toEqual(["5", "7"]); // keys kept
		expect(targets[5]).not.toBe(40000); // values jittered

		const snapDate = (
			db.prepare("SELECT snapshot_date FROM snapshots").get() as {
				snapshot_date: string;
			}
		).snapshot_date;
		expect(snapDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(snapDate).not.toBe("2026-01-31");
		db.close();
	});

	it("preserves unique indexes over shifted month/date columns (no transient collisions)", async () => {
		const { out } = await runFixture(makeTmpDir("anon-uniq-"), "unique-1");
		const db = new Database(out, { readonly: true });
		// The unique indexes themselves verify: opening + querying would throw
		// on violation, but assert distinctness explicitly.
		const incomeMonths = (
			db.prepare("SELECT month FROM income_history").all() as Array<{
				month: string;
			}>
		).map((r) => r.month);
		expect(new Set(incomeMonths).size).toBe(incomeMonths.length);
		for (const m of incomeMonths) expect(m).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
		const reviewMonths = (
			db.prepare("SELECT year_month FROM monthly_reviews").all() as Array<{
				year_month: string;
			}>
		).map((r) => r.year_month);
		expect(new Set(reviewMonths).size).toBe(reviewMonths.length);
		// Rigid shift: relative month distances are preserved
		const sorted = [...incomeMonths].sort();
		expect(monthDistance(sorted[0], sorted[1])).toBe(1);
		expect(monthDistance(sorted[1], sorted[2])).toBe(1);
		db.close();
	});
});

describe("anonymise — refusal paths", () => {
	it("refuses a source that resolves to a configured live DB (DATABASE_URL)", async () => {
		const dir = makeTmpDir("anon-live-");
		const source = path.join(dir, "configured.db");
		buildFixtureDb(source);
		const previous = process.env.DATABASE_URL;
		process.env.DATABASE_URL = source;
		try {
			await expect(
				runAnonymise({ source, out: path.join(dir, "out.db"), seed: "x" }),
			).rejects.toBeInstanceOf(AnonymiseError);
		} finally {
			if (previous === undefined) delete process.env.DATABASE_URL;
			else process.env.DATABASE_URL = previous;
		}
	});

	it("refuses paths inside the repo storage/ directory", async () => {
		const storageSource = path.resolve("storage", "definitely-not-real.db");
		await expect(
			runAnonymise({
				source: storageSource,
				out: "/tmp/nowhere-anon.db",
				seed: "x",
			}),
		).rejects.toThrow(/storage/);
	});

	it("refuses when source and out are the same file", async () => {
		const dir = makeTmpDir("anon-same-");
		const source = path.join(dir, "same.db");
		buildFixtureDb(source);
		await expect(
			runAnonymise({ source, out: source, seed: "x" }),
		).rejects.toThrow(/different files/);
	});

	it("aborts naming a schema table with no transform rules", () => {
		const gutted = { ...TABLE_RULES };
		delete gutted.snapshots;
		expect(() => verifyCoverage(gutted)).toThrow(
			/"snapshots" has no transform rules/,
		);
	});

	it("aborts naming a schema column with no transform rule", () => {
		const gutted = JSON.parse(JSON.stringify(TABLE_RULES));
		delete gutted.accounts.columns.institution;
		expect(() => verifyCoverage(gutted)).toThrow(/accounts.*institution/);
	});

	it("aborts on stale rules for columns that no longer exist", () => {
		const gutted = JSON.parse(JSON.stringify(TABLE_RULES));
		gutted.accounts.columns.ghostColumn = "skip";
		expect(() => verifyCoverage(gutted)).toThrow(/ghostColumn/);
	});
});

describe("anonymise — post-run self-check", () => {
	it("passes integrity + FK checks and prints a summary free of identity strings", async () => {
		const { out } = await runFixture(makeTmpDir("anon-check-"), "check-1");
		const check = selfCheck(out);
		expect(check.ok).toBe(true);
		expect(check.problems).toHaveLength(0);
		const summary = check.summary.join("\n");
		expect(summary).not.toContain("Main Current");
		expect(summary).not.toContain("someone");
		expect(summary).not.toContain("HSBC");
		expect(summary).toContain("transaction date range:");
	});
});

describe("shiftTaxYear", () => {
	it("snaps shifted months back onto canonical UK tax years", () => {
		expect(shiftTaxYear("2025/26", 12)).toBe("2026/27");
		expect(shiftTaxYear("2025/26", 1)).toBe("2025/26"); // Apr 2025 → May 2025, same tax year
		expect(shiftTaxYear("2025/26", 11)).toBe("2025/26"); // Apr 2025 → Mar 2026, still same tax year
		expect(shiftTaxYear("2025/26", 13)).toBe("2026/27"); // Apr 2025 → May 2026, next tax year
	});
});

// --- helpers -------------------------------------------------------------

function monthDistance(a: string, b: string): number {
	const [ay, am] = a.split("-").map(Number);
	const [by, bm] = b.split("-").map(Number);
	return by * 12 + bm - (ay * 12 + am);
}

async function runFixture(
	dir: string,
	seed: string,
): Promise<{ source: string; out: string }> {
	const source = path.join(dir, "source.db");
	const out = path.join(dir, "out.db");
	buildFixtureDb(source);
	await runAnonymise({ source, out, seed });
	return { source, out };
}

describe("anonymise — value-layer AAD safety (data-layer-integrity 2.1/2.2)", () => {
	const dataKey = crypto.randomBytes(32);

	/** Fixture DB with v1|-ciphertext rows in every slug-bound protected column. */
	function buildEncryptedFixtureDb(filePath: string): void {
		const db = new Database(filePath);
		for (const file of fs
			.readdirSync(MIGRATIONS_DIR)
			.filter((f) => f.endsWith(".sql"))
			.sort()) {
			const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
			for (const stmt of sql.split("--> statement-breakpoint")) {
				if (stmt.trim()) db.exec(stmt);
			}
		}

		db.prepare(
			"INSERT INTO users (username, password_hash, password_salt, tax_band, inactivity_timeout, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
		).run(
			"encuser",
			"realhash",
			"realsalt",
			"basic",
			5,
			ts("2026-01-01"),
			ts("2026-01-01"),
		);
		db.prepare(
			"INSERT INTO accounts (slug, user_id, name, type, tax_wrapper, category, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
		).run(
			"enc-acct-slug",
			1,
			"Enc Account",
			"current",
			"none",
			"asset",
			ts("2026-01-01"),
			ts("2026-01-01"),
		);

		// Encrypted transaction — AAD bound to (account_transactions, tx-enc-slug, description)
		const encTxDesc = encryptValue(dataKey, "Salary secret", {
			table: "account_transactions",
			rowId: "tx-enc-slug",
			column: "description",
		});
		db.prepare(
			"INSERT INTO account_transactions (slug, account_id, type, amount, description, transaction_date, created_at) VALUES (?,?,?,?,?,?,?)",
		).run(
			"tx-enc-slug",
			1,
			"deposit",
			250000,
			encTxDesc,
			ts("2026-01-05"),
			ts("2026-01-05"),
		);
		// Plaintext sibling — its slug SHOULD be regenerated
		db.prepare(
			"INSERT INTO account_transactions (slug, account_id, type, amount, description, transaction_date, created_at) VALUES (?,?,?,?,?,?,?)",
		).run(
			"tx-plain-slug",
			1,
			"withdrawal",
			-100,
			"Plain shop",
			ts("2026-01-06"),
			ts("2026-01-06"),
		);

		// Encrypted note — AAD bound to (account_notes, note-enc-slug, content)
		const encNote = encryptValue(dataKey, "Note secret", {
			table: "account_notes",
			rowId: "note-enc-slug",
			column: "content",
		});
		db.prepare(
			"INSERT INTO account_notes (slug, account_id, content, created_at) VALUES (?,?,?,?)",
		).run("note-enc-slug", 1, encNote, ts("2026-01-07"));

		// Encrypted review — AAD bound to (monthly_reviews, review-enc-slug, notes)
		const encNotes = encryptValue(dataKey, "Review secret", {
			table: "monthly_reviews",
			rowId: "review-enc-slug",
			column: "notes",
		});
		db.prepare(
			"INSERT INTO monthly_reviews (slug, user_id, year_month, completed_items, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
		).run(
			"review-enc-slug",
			1,
			"2026-01",
			"[]",
			encNotes,
			ts("2026-02-01"),
			ts("2026-02-01"),
		);

		db.close();
	}

	it("keeps slugs of v1| rows verbatim so every protected value still decrypts", async () => {
		const dir = makeTmpDir("anon-aad-");
		const source = path.join(dir, "source.db");
		const out = path.join(dir, "out.db");
		buildEncryptedFixtureDb(source);

		await runAnonymise({ source, out, seed: "aad-1" });

		const db = new Database(out, { readonly: true });

		// Encrypted transaction: slug preserved, ciphertext decrypts
		const encTx = db
			.prepare(
				"SELECT slug, description FROM account_transactions WHERE description LIKE 'v1|%'",
			)
			.get() as { slug: string; description: string };
		expect(encTx.slug).toBe("tx-enc-slug");
		expect(() =>
			decryptValue(dataKey, encTx.description, {
				table: "account_transactions",
				rowId: "tx-enc-slug",
				column: "description",
			}),
		).not.toThrow();
		expect(
			decryptValue(dataKey, encTx.description, {
				table: "account_transactions",
				rowId: "tx-enc-slug",
				column: "description",
			}),
		).toBe("Salary secret");

		// Encrypted note: slug preserved, content decrypts
		const encNote = db
			.prepare("SELECT slug, content FROM account_notes")
			.get() as { slug: string; content: string };
		expect(encNote.slug).toBe("note-enc-slug");
		expect(
			decryptValue(dataKey, encNote.content, {
				table: "account_notes",
				rowId: "note-enc-slug",
				column: "content",
			}),
		).toBe("Note secret");

		// Encrypted review: slug preserved, notes decrypt
		const encReview = db
			.prepare("SELECT slug, notes FROM monthly_reviews")
			.get() as { slug: string; notes: string };
		expect(encReview.slug).toBe("review-enc-slug");
		expect(
			decryptValue(dataKey, encReview.notes, {
				table: "monthly_reviews",
				rowId: "review-enc-slug",
				column: "notes",
			}),
		).toBe("Review secret");

		// Plaintext sibling: slug still regenerated (rename path stays active)
		const plainTx = db
			.prepare(
				"SELECT slug, description FROM account_transactions WHERE description NOT LIKE 'v1|%'",
			)
			.get() as { slug: string; description: string };
		expect(plainTx.slug).not.toBe("tx-plain-slug");

		db.close();
	});
});
