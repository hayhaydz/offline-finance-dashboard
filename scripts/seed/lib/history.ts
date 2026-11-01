/**
 * v3.2 V9 (2026-11-01): bulk fake transaction history.
 *
 * User direction — "accounts don't have enough simulated transaction
 * history. needs lots multiple pages of history. fake placeholder
 * examples." The fixtures carry ~120 hand-written transactions; this
 * generator layers ~1,000 more across every open account, spanning
 * 2025-01 → 2026-10, so the accounts table paginates (20/page → dozens
 * of pages) and the trends/balance history has depth.
 *
 * Deterministic: a seeded LCG (no Math.random) so reseeds reproduce the
 * exact same ledger. Statement-model honest (D0): these are month-shaped
 * — salary on the 25th, direct debits on fixed days, weekly groceries —
 * not realtime noise.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEFAULT_CATEGORIES } from "../../../src/lib/utils/category-colours.js";
import * as schema from "../../../src/lib/db/schema/index.js";
import { encryptTxDescription } from "../../../src/lib/server/crypto/protected-fields.js";
import type { DB } from "./db.js";

/** Minimal deterministic PRNG (mulberry32) — reproducible seeds. */
function lcg(seed: number) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type MonthlyEvent = {
	day: number;
	type: string;
	/** pence: [min, max] — sign carries direction (negative = money out) */
	amount: [number, number];
	descriptions: string[];
	categoryKey?: string;
	/** months (0-based from start) to skip — e.g. every other month */
	every?: number;
};

type AccountHistorySpec = {
	accountName: string;
	startMonth: string; // "2025-01"
	endMonth: string; // "2026-10"
	events: MonthlyEvent[];
};

const GROCERIES = ["Tesco superstore", "Sainsbury's local", "Aldi weekly shop", "Asda groceries", "Morrisons"];
const EATING_OUT = ["Costa coffee", "Nando's", "Local curry house", "Pizza Express", "Five Guys", "Pret a Manger"];
const TRANSPORT = ["TfL top-up", "Uber ride", "National Rail ticket", "Shell fuel", "BP garage"];
const SHOPPING = ["Amazon UK order", "Argos", "John Lewis", "Decathlon", "IKEA"];
const BILLS = ["Thames Water", "British Gas", "Virgin Media", "EE mobile", "Council tax", "TV licence"];
const SUBS = ["Netflix", "Spotify", "iCloud storage", "Amazon Prime", "Disney+"];

const SPECS: AccountHistorySpec[] = [
	{
		accountName: "Main Current",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 25, type: "deposit", amount: [285000, 312000], descriptions: ["Acme Corp salary"], categoryKey: "income" },
			{ day: 1, type: "withdrawal", amount: [-97500, -97500], descriptions: ["Rent — house share"], categoryKey: "expenses" },
			{ day: 4, type: "withdrawal", amount: [-3800, -8200], descriptions: GROCERIES, categoryKey: "groceries" },
			{ day: 11, type: "withdrawal", amount: [-3600, -7900], descriptions: GROCERIES, categoryKey: "groceries" },
			{ day: 18, type: "withdrawal", amount: [-3900, -8400], descriptions: GROCERIES, categoryKey: "groceries" },
			{ day: 25, type: "withdrawal", amount: [-4100, -8600], descriptions: GROCERIES, categoryKey: "groceries" },
			{ day: 7, type: "withdrawal", amount: [-1200, -4800], descriptions: EATING_OUT, categoryKey: "eating-out" },
			{ day: 19, type: "withdrawal", amount: [-900, -4600], descriptions: EATING_OUT, categoryKey: "eating-out" },
			{ day: 9, type: "withdrawal", amount: [-1500, -6500], descriptions: TRANSPORT, categoryKey: "transport" },
			{ day: 21, type: "withdrawal", amount: [-1500, -6900], descriptions: TRANSPORT, categoryKey: "transport" },
			{ day: 14, type: "withdrawal", amount: [-800, -9500], descriptions: SHOPPING, categoryKey: "shopping" },
			{ day: 3, type: "withdrawal", amount: [-799, -1199], descriptions: SUBS, categoryKey: "subscriptions" },
			{ day: 16, type: "transfer_out", amount: [-40000, -40000], descriptions: ["Standing order → Emergency Fund"] },
			{ day: 17, type: "transfer_out", amount: [-25000, -25000], descriptions: ["Standing order → ISA Saver"] },
		],
	},
	{
		accountName: "Bills Current",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 25, type: "transfer_in", amount: [160000, 160000], descriptions: ["Bills sweep from Main"] },
			{ day: 2, type: "withdrawal", amount: [-13400, -15900], descriptions: ["Council tax"] },
			{ day: 5, type: "withdrawal", amount: [-7800, -14200], descriptions: ["British Gas"] },
			{ day: 8, type: "withdrawal", amount: [-3100, -4200], descriptions: ["Thames Water"] },
			{ day: 12, type: "withdrawal", amount: [-3300, -3300], descriptions: ["Virgin Media"] },
			{ day: 15, type: "withdrawal", amount: [-1800, -2400], descriptions: ["EE mobile"] },
			{ day: 20, type: "withdrawal", amount: [-1450, -1450], descriptions: ["TV licence"] },
			{ day: 22, type: "withdrawal", amount: [-999, -2600], descriptions: ["Home insurance (monthly)"] },
		],
	},
	{
		accountName: "Visa Gold",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 6, type: "card_charge", amount: [-2200, -18900], descriptions: [...EATING_OUT, "Flight — easyJet", "Booking.com hotel", "Trainline"], categoryKey: "eating-out" },
			{ day: 13, type: "card_charge", amount: [-1500, -12400], descriptions: [...SHOPPING, "Apple Store"], categoryKey: "shopping" },
			{ day: 27, type: "transfer_in", amount: [15000, 33000], descriptions: ["Card payment from Main Current"] },
			{ day: 10, type: "refund", amount: [1500, 8900], descriptions: ["Refund — returned order", "Chargeback adjustment"], every: 4 },
		],
	},
	{
		accountName: "Mastercard",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 9, type: "card_charge", amount: [-1800, -9500], descriptions: [...SHOPPING, "Currys", "Royal Mail postage"] },
			{ day: 24, type: "transfer_in", amount: [6000, 14000], descriptions: ["Card payment from Main Current"] },
			{ day: 17, type: "card_charge", amount: [-800, -4200], descriptions: EATING_OUT, every: 2 },
		],
	},
	{
		accountName: "Rewards Card",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 8, type: "card_charge", amount: [-450, -5200], descriptions: [...GROCERIES.map((g) => `${g} (rewards)`)], categoryKey: "groceries" },
			{ day: 23, type: "transfer_in", amount: [1500, 6000], descriptions: ["Full balance payment"] },
		],
	},
	{
		accountName: "High-APR Card",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 12, type: "card_charge", amount: [-2000, -7800], descriptions: ["Emergency purchase", "Car repair deposit", "Vet bill"] },
			{ day: 28, type: "transfer_in", amount: [3000, 9000], descriptions: ["Minimum payment"] },
			{ day: 28, type: "interest", amount: [-890, -2100], descriptions: ["Interest charged (APR 23.9%)"] },
		],
	},
	{
		accountName: "Emergency Fund",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 16, type: "transfer_in", amount: [40000, 40000], descriptions: ["Monthly saving"] },
			{ day: 30, type: "interest", amount: [4100, 6200], descriptions: ["Monthly interest (4.5% AER)"] },
		],
	},
	{
		accountName: "ISA Saver",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 17, type: "transfer_in", amount: [25000, 25000], descriptions: ["ISA subscription"] },
			{ day: 31, type: "interest", amount: [2600, 3900], descriptions: ["ISA interest"] },
		],
	},
	{
		accountName: "Stocks & Shares ISA",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 5, type: "transfer_in", amount: [30000, 30000], descriptions: ["Monthly invest — global index"] },
			{ day: 15, type: "value_change", amount: [-9800, 12400], descriptions: ["Market value change"] },
			{ day: 21, type: "dividend", amount: [900, 2800], descriptions: ["Dividend — accumulator fund"] },
		],
	},
	{
		accountName: "5-Year Growth Bond",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 28, type: "interest_accrued", amount: [3100, 3600], descriptions: ["Accrued interest (fixed 4.85%)"] },
		],
	},
	{
		accountName: "Tesco Car Loan",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 6, type: "withdrawal", amount: [-31700, -31700], descriptions: ["Loan repayment (fixed)"] },
		],
	},
	{
		accountName: "Car Loan",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 10, type: "withdrawal", amount: [-22850, -22850], descriptions: ["Loan repayment (fixed)"] },
		],
	},
	{
		accountName: "Home Mortgage",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 1, type: "withdrawal", amount: [-86200, -86200], descriptions: ["Mortgage repayment (2.1% fix)"] },
		],
	},
	{
		accountName: "1-Year Fixed Bond",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 30, type: "interest_accrued", amount: [1800, 2100], descriptions: ["Accrued interest (fixed 5.1%)"] },
		],
	},
	{
		accountName: "2-Year Fixed Rate Bond",
		startMonth: "2025-01",
		endMonth: "2026-10",
		events: [
			{ day: 30, type: "interest_accrued", amount: [2400, 2700], descriptions: ["Accrued interest (fixed 5.4%)"] },
		],
	},
	{
		accountName: "Old Savings",
		startMonth: "2025-01",
		endMonth: "2025-06",
		events: [
			{ day: 28, type: "interest", amount: [110, 160], descriptions: ["Legacy interest (0.1%)"] },
		],
	},
];

function monthRange(start: string, end: string): string[] {
	const [sy, sm] = start.split("-").map(Number);
	const [ey, em] = end.split("-").map(Number);
	const out: string[] = [];
	let y = sy;
	let m = sm;
	while (y < ey || (y === ey && m <= em)) {
		out.push(`${y}-${String(m).padStart(2, "0")}`);
		m += 1;
		if (m > 12) {
			m = 1;
			y += 1;
		}
	}
	return out;
}

/** ensure the default spending categories exist and return key → id map */
async function ensureCategoryMap(
	db: DB,
	userId: number,
): Promise<Map<string, number>> {
	const existing = await db.query.spendingCategories.findMany({
		where: eq(schema.spendingCategories.userId, userId),
	});
	if (existing.length === 0) {
		for (const cat of DEFAULT_CATEGORIES) {
			await db.insert(schema.spendingCategories).values({
				slug: nanoid(16),
				userId,
				name: cat.name,
				key: cat.key,
				colour: cat.colour,
				isDefault: true,
			});
		}
	}
	const rows = await db.query.spendingCategories.findMany({
		where: eq(schema.spendingCategories.userId, userId),
	});
	return new Map(rows.map((r) => [r.key, r.id]));
}

export async function seedBulkTransactionHistory(
	db: DB,
	userId: number,
	accountByName: Map<string, typeof schema.accounts.$inferSelect>,
): Promise<number> {
	const categoryByKey = await ensureCategoryMap(db, userId);
	const today = new Date();
	const todayMs = today.getTime();

	let inserted = 0;
	let accountCount = 0;
	/** v3.2 sweep 7: per-month spend (withdrawal + charge − refund, the
	 * budget engine's definition) so each historical month can carry a
	 * budgetMonths row — the trends TARGET history + /all tables get a
	 * year+ of mixed under/over verdicts instead of 2 hand-authored rows. */
	const spendByMonth = new Map<string, number>();
	const bumpSpend = (monthKey: string, delta: number) => {
		spendByMonth.set(monthKey, (spendByMonth.get(monthKey) ?? 0) + delta);
	};

	for (const spec of SPECS) {
		const account = accountByName.get(spec.accountName);
		if (!account) continue;
		accountCount++;

		// per-account deterministic stream
		const rand = lcg(
			spec.accountName.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
		);

		for (const monthKey of monthRange(spec.startMonth, spec.endMonth)) {
			const [y, m] = monthKey.split("-").map(Number);
			let monthIdx = (y - 2025) * 12 + (m - 1);

			for (const ev of spec.events) {
				if (ev.every && monthIdx % ev.every !== 0) continue;
				const day = Math.min(
					ev.day + Math.floor(rand() * 3) - 1,
					new Date(Date.UTC(y, m, 0)).getUTCDate(),
				);
				const date = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
				if (date.getTime() > todayMs) continue; // never seed the future

				const [lo, hi] = ev.amount;
				const span = Math.max(0, hi - lo);
				const amount =
					lo +
					(span === 0
						? 0
						: // round to 5p steps — statements are rarely to the exact penny
							Math.round((rand() * span) / 5) * 5);

				const description =
					ev.descriptions[Math.floor(rand() * ev.descriptions.length)];

				const txSlug = nanoid(21);
				await db.insert(schema.accountTransactions).values({
					slug: txSlug,
					accountId: account.id,
					type: ev.type as (typeof schema.accountTransactions.$inferInsert)["type"],
					amount,
					categoryId: ev.categoryKey ? (categoryByKey.get(ev.categoryKey) ?? null) : null,
					description: encryptTxDescription(userId, txSlug, description),
					transactionDate: date,
					createdAt: date,
				});
				inserted++;
				// accumulate spend per the budget engine's type definition
				if (ev.type === "withdrawal" || ev.type === "charge") {
					bumpSpend(monthKey, Math.abs(amount));
				} else if (ev.type === "refund") {
					bumpSpend(monthKey, -Math.abs(amount));
				}
			}
		}
	}

	console.log(
		`  ✓ Bulk history: ${inserted} transactions across ${accountCount} accounts (2025-01 → 2026-10, deterministic)`,
	);

	// v3.2 sweep 7: one budgetMonths row per seeded month. Target derives
	// from that month's OWN spend × a deterministic 0.82–1.18 factor —
	// history shows a realistic mix of UNDER/OVER verdicts (D0 honest:
	// these are declared intents, not predictions). onConflictDoNothing
	// keeps the hand-authored current-month + amendment-demo rows.
	let budgetMonthsSeeded = 0;
	for (const monthKey of [...spendByMonth.keys()].sort()) {
		const spend = spendByMonth.get(monthKey) ?? 0;
		if (spend <= 0) continue;
		const monthRand = lcg(
			monthKey.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 13),
		);
		const factor = 0.82 + monthRand() * 0.36;
		const target = Math.max(
			20_000,
			Math.round((spend * factor) / 500) * 500,
		);
		await db
			.insert(schema.budgetMonths)
			.values({
				userId,
				month: monthKey,
				totalTargetInCents: target,
			})
			.onConflictDoNothing();
		budgetMonthsSeeded++;
	}
	console.log(
		`  ✓ Bulk budget months: ${budgetMonthsSeeded} historical targets (mixed under/over, deterministic)`,
	);

	return inserted;
}
