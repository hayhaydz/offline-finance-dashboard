#!/usr/bin/env node
/**
 * Data Anonymiser — deterministic, structure-preserving anonymisation of a
 * database COPY for bug reports and agent sessions.
 *
 * Shape contract (bug repro is the point):
 *   - Dates: constant whole-month offset per run (seed-derived) applied to
 *     every date/timestamp column. Month grouping, pagination boundaries and
 *     within-month intervals keep their exact shape.
 *   - Amounts: ±5% proportional jitter, sign preserved, zeros stay zero,
 *     pence-rounded. Budgets/alerts still trigger at similar thresholds.
 *   - Text: seeded word-list renames preserving word count and length class;
 *     slugs regenerated (21-char nanoid alphabet, seeded).
 *   - Determinism: same source + same --seed → identical output.
 *
 * Safety contract:
 *   - Operates only on an explicit --source/--out pair (out is a fresh copy).
 *   - Refuses any path that resolves to a configured live DB or anything
 *     under storage/.
 *   - Never logs source values (counts and aggregates only).
 *   - Aborts naming any schema table/column with no transform rule — schema
 *     drift fails loud instead of silently copying personal data.
 *
 * Usage:
 *   npx tsx scripts/anonymise.ts --source <file> --out <file> [--seed X]
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash as argonHash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../src/lib/db/schema/index";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AnonymiseError extends Error {}

// ---------------------------------------------------------------------------
// Deterministic primitives (no Math.random / crypto randomness anywhere in
// transform paths — every value is a pure function of seed + input)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit — stable string hash. */
function fnv1a(input: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic. */
function mulberry32(a: number): () => number {
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Seeded RNG keyed by arbitrary parts (order-independent determinism). */
function rngFrom(seed: string, ...parts: Array<string | number>): () => number {
	return mulberry32(fnv1a(`${seed}\u0000${parts.join("\u0000")}`));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
	return items[Math.floor(rng() * items.length) % items.length];
}

// ---------------------------------------------------------------------------
// Word lists (neutral, bank-style vocabulary)
// ---------------------------------------------------------------------------

const WORDS_CAP = [
	"Harbour",
	"Beacon",
	"Northline",
	"Cedar",
	"Meridian",
	"Aldgate",
	"Brook",
	"Column",
	"Dunmore",
	"Eastvale",
	"Fernway",
	"Granite",
	"Halstead",
	"Ivywood",
	"Juniper",
	"Kingsway",
	"Larchmont",
	"Maplefield",
	"Netherby",
	"Oakbridge",
	"Pinehurst",
	"Quarry",
	"Redhill",
	"Stonegate",
	"Thornbury",
	"Upton",
	"Vineyard",
	"Westbrook",
	"Yarrow",
	"Ashford",
	"Birchwood",
	"Cliffden",
	"Dovercourt",
	"Elmsworth",
	"Fairhaven",
	"Glenmore",
	"Highfield",
] as const;

const WORDS_LOWER = [
	"harbour",
	"beacon",
	"northline",
	"cedar",
	"meridian",
	"aldgate",
	"brook",
	"column",
	"dunmore",
	"eastvale",
	"fernway",
	"granite",
	"halstead",
	"ivywood",
	"juniper",
	"kingsway",
	"larchmont",
	"maplefield",
	"netherby",
	"oakbridge",
	"pinehurst",
	"quarry",
	"redhill",
	"stonegate",
	"thornbury",
	"upton",
	"vineyard",
	"westbrook",
	"yarrow",
	"ashford",
	"birchwood",
	"cliffden",
	"dovercourt",
	"elmsworth",
	"fairhaven",
	"glenmore",
	"highfield",
	"saver",
	"reserve",
	"growth",
	"income",
	"flexible",
	"fixed",
	"premium",
	"standard",
	"plus",
	"everyday",
	"regular",
	"bond",
	"fund",
] as const;

// ---------------------------------------------------------------------------
// Date helpers — whole-month calendar shift with day clamping
// ---------------------------------------------------------------------------

export function addMonthsToUtcSeconds(seconds: number, months: number): number {
	const d = new Date(seconds * 1000);
	const year = d.getUTCFullYear();
	const month = d.getUTCMonth();
	const day = d.getUTCDate();
	// Total months → carry, clamp day to target month length
	const total = year * 12 + month + months;
	const targetYear = Math.floor(total / 12);
	const targetMonth = total % 12;
	const daysInTarget = new Date(
		Date.UTC(targetYear, targetMonth + 1, 0),
	).getUTCDate();
	const clampedDay = Math.min(day, daysInTarget);
	return Math.floor(
		Date.UTC(
			targetYear,
			targetMonth,
			clampedDay,
			d.getUTCHours(),
			d.getUTCMinutes(),
			d.getUTCSeconds(),
		) / 1000,
	);
}

export function shiftYearMonth(ym: string, months: number): string {
	const [y, m] = ym.split("-").map(Number);
	const total = y * 12 + (m - 1) + months;
	const ty = Math.floor(total / 12);
	const tm = ((total % 12) + 12) % 12;
	return `${ty}-${String(tm + 1).padStart(2, "0")}`;
}

export function shiftIsoDate(iso: string, months: number): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(iso);
	if (!match) return iso;
	const [, y, m, d, suffix] = match;
	const shifted = addMonthsToUtcSeconds(
		Math.floor(Date.UTC(Number(y), Number(m) - 1, Number(d)) / 1000),
		months,
	);
	const nd = new Date(shifted * 1000);
	return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}-${String(nd.getUTCDate()).padStart(2, "0")}${suffix}`;
}

/**
 * Tax years are "YYYY/YY" keyed to UK tax years (start 6 April). Shift the
 * start month by the offset, then snap to the tax year containing the result
 * so the string stays canonical. (Edge rows at 6-April boundaries may not
 * stay aligned — accepted by design.)
 */
export function shiftTaxYear(ty: string, months: number): string {
	const match = /^(\d{4})\/(\d{2})$/.exec(ty);
	if (!match) return ty;
	const startYear = Number(match[1]);
	// Tax year start month: April of startYear
	const total = startYear * 12 + 3 + months;
	const resultYear = Math.floor(total / 12);
	const resultMonth = ((total % 12) + 12) % 12;
	// UK tax year containing (resultYear, resultMonth): April+ → that year
	const containingStart = resultMonth >= 3 ? resultYear : resultYear - 1;
	const endTwoDigit = String((containingStart + 1) % 100).padStart(2, "0");
	return `${containingStart}/${endTwoDigit}`;
}

// ---------------------------------------------------------------------------
// Amount jitter — ±5% proportional, sign-preserving, zero-safe
// ---------------------------------------------------------------------------

export function jitterAmount(value: number, rng: () => number): number {
	if (!Number.isFinite(value) || value === 0) return value;
	const u = (rng() * 2 - 1) * 0.05;
	return Math.round(value * (1 + u));
}

// ---------------------------------------------------------------------------
// Text transforms — seeded, memoised, structure-preserving
// ---------------------------------------------------------------------------

const NUMERIC_TOKEN = /^[0-9.,£$%€+-]+$/;

function fakeToken(token: string, rng: () => number): string {
	if (!/[a-z]/i.test(token) || NUMERIC_TOKEN.test(token)) return token;
	const bare = token.replace(/[^A-Za-z]/g, "");
	const targetLen = bare.length;
	const pool: readonly string[] = /^[A-Z]/.test(token)
		? WORDS_CAP
		: WORDS_LOWER;
	// Length class: prefer words within ±2 of the original length
	const near = pool.filter((w) => Math.abs(w.length - targetLen) <= 2);
	const chosen = pick(rng, near.length > 0 ? near : pool);
	let out = chosen;
	if (token === token.toUpperCase() && token.length > 1)
		out = out.toUpperCase();
	else if (!/^[A-Z]/.test(token)) out = out.toLowerCase();
	else out = out[0].toUpperCase() + out.slice(1).toLowerCase();
	return out;
}

/** Word-count and length-class preserving loremisation, memoised by source. */
function fakeText(
	original: string,
	seed: string,
	memo: Map<string, string>,
	kind: string,
): string {
	const cached = memo.get(original);
	if (cached !== undefined) return cached;
	const tokens = original.split(/(\s+)/); // keep whitespace tokens verbatim
	const out = tokens
		.map((tok) => {
			if (tok.trim() === "") return tok;
			const rng = rngFrom(seed, kind, original, tok);
			return fakeToken(tok, rng);
		})
		.join("");
	const result = out === "" ? original : out;
	memo.set(original, result);
	return result;
}

/** Fake usernames: two lowercase words + 2 digits, unique per run. */
function fakeUsername(
	original: string,
	seed: string,
	memo: Map<string, string>,
	used: Set<string>,
): string {
	const cached = memo.get(original);
	if (cached !== undefined) return cached;
	const rng = rngFrom(seed, "username", original);
	let candidate = `${pick(rng, WORDS_LOWER)}.${pick(rng, WORDS_LOWER)}${10 + Math.floor(rng() * 90)}`;
	while (used.has(candidate)) {
		candidate = `${candidate}x`; // deterministic de-dedupe
	}
	used.add(candidate);
	memo.set(original, candidate);
	return candidate;
}

// ---------------------------------------------------------------------------
// Slug / token regeneration (seeded; visually identical to nanoid output)
// ---------------------------------------------------------------------------

const NANOID_ALPHABET =
	"useandom-26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";

function seededNanoId(seed: string, ...parts: Array<string | number>): string {
	const rng = rngFrom(seed, "slug", ...parts);
	let out = "";
	for (let i = 0; i < 21; i++) {
		out += NANOID_ALPHABET[Math.floor(rng() * NANOID_ALPHABET.length)];
	}
	return out;
}

function seededToken(seed: string, original: string): string {
	const rng = rngFrom(seed, "token", original);
	let out = "";
	for (let i = 0; i < 64; i++) {
		out += "0123456789abcdef"[Math.floor(rng() * 16)];
	}
	return out;
}

// ---------------------------------------------------------------------------
// Table rules — every schema table AND column must be classified here.
// Unmapped tables/columns abort the run (fail loud on schema drift).
// Keyed by drizzle property name; resolved to DDL column names at runtime.
// ---------------------------------------------------------------------------

type ColKind =
	| "skip" // structural: ids, enums, booleans, counts, keys, colours
	| "ts" // integer epoch-seconds timestamp → whole-month shift
	| "year-month" // "YYYY-MM" text → whole-month shift
	| "iso-date" // "YYYY-MM-DD" text → whole-month shift
	| "tax-year" // "YYYY/YY" → shift + snap to containing UK tax year
	| "amount" // integer cents / basis points → ±5% jitter
	| "name" // identity text: memoised seeded rename (shared across tables + JSON)
	| "protected-text" // value-layer ciphertext (v1|…) kept verbatim (opaque, PII-free); legacy plaintext → seeded rename
	| "username" // memoised seeded username, unique
	| "slug" // 21-char seeded nanoid-alphabet regeneration (memoised)
	| "token" // deterministic fake opaque token
	| "secret" // auth material → fixed placeholders (column-specific)
	| "json" // recursive walk: id-keys kept, date-strings shifted, numbers jittered, memo strings swapped
	| "json-ids" // JSON array of ids — kept verbatim
	| "json-encoded" // JSON-encoded string column: parse → walk → re-stringify
	| "metadata-value"; // key-value store value: ISO-date-like → shift, else keep

type TableRule = {
	pk: string; // property name of the primary key used in WHERE
	// Process rows in DESCENDING order of this column. Required for tables
	// with unique indexes over date-like columns: in-place whole-month shifts
	// collide transiently unless the holder of a target value is always
	// processed before the row moving into it (safe for positive offsets).
	orderDesc?: string;
	columns: Record<string, ColKind>;
};

export const TABLE_RULES: Record<string, TableRule> = {
	users: {
		pk: "id",
		columns: {
			id: "skip",
			username: "username",
			passwordHash: "secret",
			totpSecret: "secret",
			totpSecretIV: "secret",
			passwordSalt: "secret",
			mfaSetupToken: "secret",
			taxBand: "skip",
			inactivityTimeout: "skip",
			createdAt: "ts",
			updatedAt: "ts",
		},
	},
	sessions: {
		pk: "id",
		columns: {
			id: "skip",
			token: "token",
			userId: "skip",
			createdAt: "ts",
			lastActivity: "ts",
		},
	},
	backupCodes: {
		pk: "id",
		columns: {
			id: "skip",
			userId: "skip",
			code: "secret",
			used: "skip",
			createdAt: "ts",
		},
	},
	// Envelope keyring (task 5.2): wrapped slots contain no PII — just an
	// AES-GCM-wrapped random key. Structure preserved so anonymised fixtures
	// exercise the real (sealed) path; wrapped material is NOT valid without
	// the credential secrets, by construction.
	credentialSlots: {
		pk: "id",
		columns: {
			id: "skip",
			slotId: "token",
			userId: "skip",
			kind: "skip",
			wrappedKey: "secret",
			iv: "secret",
			metadata: "json",
			createdAt: "ts",
			revokedAt: "ts",
		},
	},
	loginAttempts: {
		pk: "username",
		columns: {
			username: "username",
			count: "skip",
			lastAttempt: "ts",
			lockedUntil: "ts",
		},
	},
	accounts: {
		pk: "id",
		columns: {
			id: "skip",
			slug: "slug",
			userId: "skip",
			name: "name",
			institution: "name",
			type: "skip",
			taxWrapper: "skip",
			category: "skip",
			liquidity: "skip",
			excludedFromNetWorth: "skip",
			openedAt: "ts",
			closedAt: "ts",
			deletedAt: "ts",
			maturityDate: "ts",
			createdAt: "ts",
			updatedAt: "ts",
			minimumPaymentType: "skip",
			minimumPaymentFlat: "amount",
			minimumPaymentPercentage: "amount",
			creditLimit: "amount",
			originalPrincipal: "amount",
		},
	},
	accountTransactions: {
		pk: "id",
		columns: {
			id: "skip",
			slug: "slug",
			accountId: "skip",
			type: "skip",
			amount: "amount",
			categoryId: "skip",
			description: "protected-text",
			transactionDate: "ts",
			createdAt: "ts",
		},
	},
	interestRates: {
		pk: "id",
		columns: {
			id: "skip",
			accountId: "skip",
			rate: "amount",
			effectiveFrom: "ts",
			createdAt: "ts",
		},
	},
	accountNotes: {
		pk: "id",
		columns: {
			id: "skip",
			slug: "slug",
			accountId: "skip",
			content: "protected-text",
			createdAt: "ts",
		},
	},
	spendingCategories: {
		pk: "id",
		columns: {
			id: "skip",
			slug: "slug",
			userId: "skip",
			name: "name",
			key: "skip",
			colour: "skip",
			isDefault: "skip",
			createdAt: "ts",
			deletedAt: "ts",
		},
	},
	goals: {
		pk: "id",
		columns: {
			id: "skip",
			slug: "slug",
			userId: "skip",
			name: "name",
			targetAmountInCents: "amount",
			currentAllocation: "amount",
			targetDate: "ts",
			isEmergencyFund: "skip",
			sortOrder: "skip",
			deletedAt: "ts",
			goalType: "skip",
			linkedAccountId: "skip",
			startingBalanceInCents: "amount",
			createdAt: "ts",
			updatedAt: "ts",
		},
	},
	goalAllocations: {
		pk: "id",
		columns: {
			id: "skip",
			goalId: "skip",
			accountId: "skip",
			amount: "amount",
			type: "skip",
			allocationDate: "ts",
			createdAt: "ts",
		},
	},
	goalMilestones: {
		pk: "id",
		columns: {
			id: "skip",
			goalId: "skip",
			label: "name",
			thresholdInCents: "amount",
			reachedAt: "ts",
			createdAt: "ts",
		},
	},
	taxBandHistory: {
		pk: "id",
		orderDesc: "fromTaxYear",
		columns: {
			id: "skip",
			userId: "skip",
			band: "skip",
			fromTaxYear: "tax-year",
			toTaxYear: "tax-year",
			createdAt: "ts",
			updatedAt: "ts",
		},
	},
	incomeHistory: {
		pk: "id",
		orderDesc: "month",
		columns: {
			id: "skip",
			userId: "skip",
			month: "year-month",
			grossIncomeInCents: "amount",
			note: "name",
			createdAt: "ts",
			updatedAt: "ts",
		},
	},
	expensesHistory: {
		pk: "id",
		orderDesc: "month",
		columns: {
			id: "skip",
			userId: "skip",
			month: "year-month",
			monthlyExpensesInCents: "amount",
			note: "name",
			createdAt: "ts",
			updatedAt: "ts",
		},
	},
	budgetMonths: {
		pk: "id",
		orderDesc: "month",
		columns: {
			id: "skip",
			userId: "skip",
			month: "year-month",
			totalTargetInCents: "amount",
			excludedCategoryIds: "json-ids",
			excludedAccountIds: "json-ids",
			excludedTypes: "json",
			categoryTargets: "json",
			createdAt: "ts",
		},
	},
	budgetConfigAmendments: {
		pk: "id",
		columns: {
			id: "skip",
			budgetMonthId: "skip",
			field: "skip",
			oldValue: "json-encoded",
			newValue: "json-encoded",
			note: "name",
			createdAt: "ts",
		},
	},
	monthlyReviews: {
		pk: "id",
		orderDesc: "yearMonth",
		columns: {
			id: "skip",
			slug: "slug",
			userId: "skip",
			yearMonth: "year-month",
			completedItems: "json",
			notes: "protected-text",
			createdAt: "ts",
			updatedAt: "ts",
		},
	},
	snapshots: {
		pk: "id",
		orderDesc: "snapshotDate",
		columns: {
			id: "skip",
			slug: "slug",
			userId: "skip",
			snapshotDate: "iso-date",
			netWorthInCents: "amount",
			totalAssetsInCents: "amount",
			totalLiabilitiesInCents: "amount",
			totalAllocatedInCents: "amount",
			accountsBreakdown: "json",
			interestBreakdown: "json",
			goalsBreakdown: "json",
			isaBreakdown: "json",
			interestBreakdownDetail: "json",
			isaAndInterestBreakdown: "json",
			notes: "name",
			createdAt: "ts",
		},
	},
	systemMetadata: {
		pk: "key",
		columns: { key: "skip", value: "metadata-value" },
	},
	settings: {
		pk: "key",
		columns: { key: "skip", value: "metadata-value", updatedAt: "ts" },
	},
};

// ---------------------------------------------------------------------------
// Schema introspection + coverage verification (fail loud, name offenders)
// ---------------------------------------------------------------------------

export function schemaTables(): Array<{ name: string; table: SQLiteTable }> {
	return Object.entries(schema)
		.filter(([, value]) => is(value, SQLiteTable))
		.map(([name, table]) => ({ name, table: table as SQLiteTable }));
}

export function verifyCoverage(rules: Record<string, TableRule>): void {
	const problems: string[] = [];
	for (const { name, table } of schemaTables()) {
		const rule = rules[name];
		if (!rule) {
			problems.push(
				`table "${name}" has no transform rules — add it to TABLE_RULES in scripts/anonymise.ts (never add a catch-all)`,
			);
			continue;
		}
		const columns = getTableColumns(table);
		for (const [prop, col] of Object.entries(columns)) {
			if (!(prop in rule.columns)) {
				problems.push(
					`column "${name}"."${prop}" (DDL: ${col.name}) has no transform rule — classify it in TABLE_RULES`,
				);
			}
		}
		for (const prop of Object.keys(rule.columns)) {
			if (!(prop in columns)) {
				problems.push(
					`TABLE_RULES classifies "${name}"."${prop}" but the schema has no such column (stale rule — remove it)`,
				);
			}
		}
	}
	if (problems.length > 0) {
		throw new AnonymiseError(
			`anonymiser coverage failure (schema drift?) — refusing to copy untransformed data:\n  - ${problems.join("\n  - ")}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Path guards — refuse live configured DBs and storage/ locations
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

function configuredLivePaths(): string[] {
	const paths = new Set<string>();
	if (process.env.DATABASE_URL) {
		paths.add(path.resolve(process.cwd(), process.env.DATABASE_URL));
	}
	for (const p of [
		"storage/dev-plain.db",
		"storage/dev-encrypted.db",
		"storage/dev.db",
		"storage/prod.db",
		"storage/test.db",
		"storage/database.db",
	]) {
		paths.add(path.resolve(REPO_ROOT, p));
	}
	return [...paths];
}

export function guardPaths(sourceAbs: string, outAbs: string): void {
	const storageDir = path.resolve(REPO_ROOT, "storage");
	const live = configuredLivePaths();
	for (const [label, p] of [
		["--source", sourceAbs],
		["--out", outAbs],
	] as const) {
		if (p.startsWith(`${storageDir}${path.sep}`) || p === storageDir) {
			throw new AnonymiseError(
				`${label} resolves inside the database storage directory (${storageDir}) — copy the DB outside storage/ first and never write anonymised output back into storage/`,
			);
		}
		const hit = live.find((candidate) => candidate === p);
		if (hit) {
			throw new AnonymiseError(
				`${label} resolves to a configured live database (${hit}) — the anonymiser only operates on file copies. Aborting before reading data.`,
			);
		}
	}
	if (sourceAbs === outAbs) {
		throw new AnonymiseError("--source and --out must be different files");
	}
}

// ---------------------------------------------------------------------------
// JSON walking — ids stay, dates shift, amounts jitter, memoised text swaps
// ---------------------------------------------------------------------------

const ID_KEY = /^(id|accountId|goalId|userId|categoryId|budgetMonthId)$/i;
const ISO_STRING = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

type WalkCtx = {
	seed: string;
	months: number;
	textMemo: Map<string, string>;
	slugMemo: Map<string, string>;
};

function walkJson(value: unknown, ctx: WalkCtx, trail: string): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value) || value === 0) return value;
		return jitterAmount(value, rngFrom(ctx.seed, "json", trail, value));
	}
	if (typeof value === "string") {
		if (ISO_STRING.test(value)) {
			// Shift the date prefix, keep any time/zone suffix verbatim
			return `${shiftIsoDate(value.slice(0, 10), ctx.months)}${value.slice(10)}`;
		}
		const slug = ctx.slugMemo.get(value);
		if (slug !== undefined) return slug;
		const text = ctx.textMemo.get(value);
		if (text !== undefined) return text;
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item, i) => walkJson(item, ctx, `${trail}[${i}]`));
	}
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (ID_KEY.test(k) && typeof v === "number") {
				out[k] = v; // structural ids are never jittered
			} else {
				out[k] = walkJson(v, ctx, `${trail}.${k}`);
			}
		}
		return out;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Secrets — deterministic placeholders (output DB stays loginable)
// ---------------------------------------------------------------------------

export const DUMMY_TOTP_SECRET = "JBSWY3DPEHPK3PXP"; // well-known test base32
const FIXED_ARGON_SALT = Buffer.from("anonymise-fixed1"); // 16 bytes

async function placeholderPasswordHash(): Promise<string> {
	return argonHash("password", {
		algorithm: 2,
		memoryCost: 65536,
		timeCost: 3,
		parallelism: 1,
		outputLen: 32,
		salt: FIXED_ARGON_SALT,
	});
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export type AnonymiseOptions = {
	source: string;
	out: string;
	seed?: string;
};

export type AnonymiseResult = {
	seed: string;
	monthOffset: number;
	loginUsername: string | null; // fake username of the lowest-id user
	tableCounts: Record<string, number>;
};

export async function runAnonymise(
	options: AnonymiseOptions,
	log: (msg: string) => void = () => {},
): Promise<AnonymiseResult> {
	const sourceAbs = path.resolve(process.cwd(), options.source);
	const outAbs = path.resolve(process.cwd(), options.out);
	guardPaths(sourceAbs, outAbs);

	if (!existsSync(sourceAbs)) {
		throw new AnonymiseError(`--source file not found: ${options.source}`);
	}

	verifyCoverage(TABLE_RULES);

	const seed =
		options.seed ??
		`${Date.now().toString(36)}${process.pid.toString(36)}${Math.floor(
			Math.random() * 1e9,
		).toString(36)}`;

	// Whole-month date offset for this run: 1..24 months forward
	const monthOffset = 1 + Math.floor(rngFrom(seed, "date-offset")() * 24);

	const textMemo = new Map<string, string>();
	const slugMemo = new Map<string, string>();
	const slugUsed = new Set<string>();
	const usernameMemo = new Map<string, string>();
	const usernameUsed = new Set<string>();
	const ctx: WalkCtx = { seed, months: monthOffset, textMemo, slugMemo };
	const passwordHash = await placeholderPasswordHash();

	copyFileSync(sourceAbs, outAbs);
	let db: Database.Database;
	try {
		db = new Database(outAbs);
		// A cipher-encrypted file opens lazily but fails on first read
		db.prepare("SELECT count(*) AS c FROM sqlite_master").get();
	} catch (error) {
		throw new AnonymiseError(
			`cannot open source copy as a plain SQLite database (encrypted source? ${error instanceof Error ? error.message : String(error)})`,
		);
	}

	db.pragma("foreign_keys = OFF");

	// Closed-account UPDATE triggers would abort transforms — save, drop, recreate
	const triggers = db
		.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'")
		.all() as Array<{ name: string; sql: string }>;
	for (const t of triggers) db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);

	const tableCounts: Record<string, number> = {};
	let loginUsername: string | null = null;

	try {
		db.transaction(() => {
			for (const { name, table } of schemaTables()) {
				const rule = TABLE_RULES[name];
				if (!rule) continue; // verifyCoverage already aborted
				const columns = getTableColumns(table);
				const ddl = (prop: string) => columns[prop]?.name;
				const dbTableName = getTableName(table);

				const orderClause = rule.orderDesc
					? ` ORDER BY "${ddl(rule.orderDesc)}" DESC`
					: "";
				const rows = db
					.prepare(`SELECT * FROM "${dbTableName}"${orderClause}`)
					.all() as Array<Record<string, unknown>>;
				tableCounts[dbTableName] = rows.length;

				for (const row of rows) {
					const pkDdl = ddl(rule.pk);
					const pkValue = row[pkDdl as string];
					const pkTrail = `${dbTableName}#${pkValue}`;
					const sets: Array<[string, unknown]> = [];

					for (const [prop, kind] of Object.entries(rule.columns)) {
						const col = ddl(prop);
						if (!col) continue;
						const value = row[col];
						let next: unknown = value;

						switch (kind) {
							case "skip":
								break;
							case "ts":
								if (typeof value === "number" && Number.isFinite(value)) {
									next = addMonthsToUtcSeconds(value, monthOffset);
								}
								break;
							case "year-month":
								if (typeof value === "string") {
									next = shiftYearMonth(value, monthOffset);
								}
								break;
							case "iso-date":
								if (typeof value === "string") {
									next = shiftIsoDate(value, monthOffset);
								}
								break;
							case "tax-year":
								if (typeof value === "string") {
									next = shiftTaxYear(value, monthOffset);
								}
								break;
							case "amount":
								if (typeof value === "number") {
									next = jitterAmount(
										value,
										rngFrom(seed, "amount", pkTrail, col, value),
									);
								}
								break;
							case "name":
								if (typeof value === "string") {
									next = fakeText(value, seed, textMemo, "name");
								}
								break;
							case "protected-text":
								// Value-layer ciphertext is opaque without the user's
								// DataKey (no PII) — keep the encrypted format verbatim
								// so fixtures exercise the real decrypt path. Legacy
								// plaintext rows (pre-migration) get the seeded rename.
								if (typeof value === "string") {
									next = value.startsWith("v1|")
										? value
										: fakeText(value, seed, textMemo, "name");
								}
								break;
							case "username": {
								if (typeof value === "string") {
									next = fakeUsername(value, seed, usernameMemo, usernameUsed);
								}
								break;
							}
							case "slug": {
								if (typeof value === "string") {
									let candidate = slugMemo.get(value);
									if (candidate === undefined) {
										candidate = seededNanoId(seed, value);
										while (slugUsed.has(candidate)) {
											candidate = seededNanoId(seed, value, candidate);
										}
										slugUsed.add(candidate);
										slugMemo.set(value, candidate);
									}
									next = candidate;
								}
								break;
							}
							case "token":
								if (typeof value === "string") {
									next = seededToken(seed, value);
								}
								break;
							case "secret": {
								if (col === "password_hash") next = passwordHash;
								else if (col === "totp_secret")
									next = `PLAIN:${DUMMY_TOTP_SECRET}`;
								else if (col === "totp_secret_iv") next = "PLAIN";
								else if (col === "password_salt") {
									next = seededToken(seed, "salt");
								} else if (col === "mfa_setup_token") next = null;
								else if (col === "code") next = "ANONYMISED";
								else if (col === "wrapped_key" || col === "iv")
									next = seededToken(seed, String(value ?? ""));
								break;
							}
							case "json": {
								if (typeof value === "string" && value.length > 0) {
									try {
										const parsed = JSON.parse(value);
										const walked = walkJson(parsed, ctx, `${pkTrail}.${col}`);
										next = JSON.stringify(walked);
									} catch {
										next = value; // not valid JSON — leave verbatim
									}
								}
								break;
							}
							case "json-ids":
								next = value; // ids stay verbatim by definition
								break;
							case "json-encoded": {
								if (typeof value === "string" && value.length > 0) {
									try {
										const parsed = JSON.parse(value);
										const walked = walkJson(parsed, ctx, `${pkTrail}.${col}`);
										next = JSON.stringify(walked);
									} catch {
										next = value;
									}
								}
								break;
							}
							case "metadata-value": {
								if (typeof value === "string" && ISO_STRING.test(value)) {
									next = shiftIsoDate(value, monthOffset);
								}
								break;
							}
						}

						if (next !== value) {
							sets.push([col, next]);
						}
					}

					if (sets.length === 0) continue;
					const assignments = sets.map(([c]) => `"${c}" = ?`).join(", ");
					const sql = `UPDATE "${dbTableName}" SET ${assignments} WHERE "${pkDdl}" = ?`;
					db.prepare(sql).run(...sets.map(([, v]) => v), pkValue);
				}
				log(`✓ ${dbTableName}: ${rows.length} rows`);
			}
		})();
	} finally {
		// Recreate the triggers we dropped, whatever happened
		for (const t of triggers) {
			if (t.sql) db.exec(t.sql);
		}
		db.pragma("foreign_keys = ON");
	}

	// First (lowest-id) user is the documented login user for the output copy
	const firstUser = db
		.prepare("SELECT username FROM users ORDER BY id LIMIT 1")
		.get() as { username: string } | undefined;
	loginUsername = firstUser?.username ?? null;

	db.close();

	return { seed, monthOffset, loginUsername, tableCounts };
}

// ---------------------------------------------------------------------------
// Post-run self-check: integrity + plausibility (no identity strings)
// ---------------------------------------------------------------------------

export type SelfCheckResult = {
	ok: boolean;
	problems: string[];
	summary: string[];
};

export function selfCheck(outPath: string): SelfCheckResult {
	const problems: string[] = [];
	const summary: string[] = [];
	const db = new Database(outPath, { readonly: true });

	const integrity = db.pragma("integrity_check", { simple: true }) as string;
	if (integrity !== "ok") problems.push(`integrity_check: ${integrity}`);

	const fk = db.pragma("foreign_key_check") as unknown[];
	if (fk.length > 0)
		problems.push(`foreign_key_check: ${fk.length} violation(s)`);

	const present = new Set(
		(
			db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as Array<{ name: string }>
		).map((r) => r.name),
	);
	for (const { table } of schemaTables()) {
		const name = getTableName(table);
		if (!present.has(name)) problems.push(`table missing from output: ${name}`);
	}

	// Plausibility summary — aggregates only, never identity strings
	const counts = [
		"users",
		"accounts",
		"account_transactions",
		"goals",
		"snapshots",
	];
	for (const t of counts) {
		const row = db.prepare(`SELECT count(*) AS c FROM "${t}"`).get() as {
			c: number;
		};
		summary.push(`${t}: ${row.c}`);
	}
	const tx = db
		.prepare(
			"SELECT count(*) AS n, min(amount) AS min, max(amount) AS max, avg(amount) AS avg FROM account_transactions",
		)
		.get() as {
		n: number;
		min: number | null;
		max: number | null;
		avg: number | null;
	};
	if (tx.n > 0 && tx.min !== null && tx.max !== null && tx.avg !== null) {
		summary.push(
			`transaction amounts: min £${(tx.min / 100).toFixed(2)}, max £${(tx.max / 100).toFixed(2)}, avg £${(tx.avg / 100).toFixed(2)}`,
		);
	}
	const dates = db
		.prepare(
			"SELECT min(transaction_date) AS lo, max(transaction_date) AS hi FROM account_transactions",
		)
		.get() as { lo: number | null; hi: number | null };
	if (dates.lo !== null && dates.hi !== null) {
		const fmt = (secs: number) =>
			new Date(secs * 1000).toISOString().slice(0, 10);
		summary.push(`transaction date range: ${fmt(dates.lo)} → ${fmt(dates.hi)}`);
	}
	const netWorth = db
		.prepare(
			"SELECT net_worth_in_cents FROM snapshots ORDER BY snapshot_date DESC LIMIT 1",
		)
		.get() as { net_worth_in_cents: number } | undefined;
	if (netWorth) {
		summary.push(
			`latest snapshot net worth: £${(netWorth.net_worth_in_cents / 100).toFixed(2)}`,
		);
	}

	db.close();
	return { ok: problems.length === 0, problems, summary };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--source" || a === "--out" || a === "--seed") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				console.error(`❌ ${a} requires a value`);
				process.exit(1);
			}
			out[a.slice(2)] = value;
			i++;
		} else {
			console.error(`❌ Unknown argument: ${a}`);
			console.error(
				"Usage: npx tsx scripts/anonymise.ts --source <file> --out <file> [--seed X]",
			);
			process.exit(1);
		}
	}
	if (!out.source || !out.out) {
		console.error(
			"❌ --source and --out are required\nUsage: npx tsx scripts/anonymise.ts --source <file> --out <file> [--seed X]",
		);
		process.exit(1);
	}
	return out;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	console.log("🔒 Anonymiser: structure-preserving, deterministic");
	console.log(`   source: ${args.source}`);
	console.log(`   out:    ${args.out}`);
	if (!args.seed) {
		console.log(
			"   (no --seed given — a random seed was generated; pass it to reproduce)",
		);
	}

	const result = await runAnonymise(
		{ source: args.source, out: args.out, seed: args.seed },
		(msg) => console.log(msg),
	);

	console.log(`\n📊 Transform summary`);
	console.log(`   seed: ${result.seed}`);
	console.log(`   date offset: ${result.monthOffset} whole month(s) forward`);
	console.log(`   login username (fake): ${result.loginUsername ?? "—"}`);
	console.log(
		`   password (all users): "password" · TOTP secret: ${DUMMY_TOTP_SECRET}`,
	);

	const check = selfCheck(args.out);
	console.log(`\n🩺 Self-check (${check.ok ? "PASS" : "FAIL"})`);
	for (const p of check.problems) console.log(`   ✗ ${p}`);
	for (const s of check.summary) console.log(`   · ${s}`);

	if (!check.ok) process.exit(1);
}

// Run as CLI only when invoked directly (not imported by tests)
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch((error) => {
		console.error(
			`❌ ${error instanceof AnonymiseError ? error.message : `Unexpected failure: ${error instanceof Error ? error.message : String(error)}`}`,
		);
		process.exit(1);
	});
}
