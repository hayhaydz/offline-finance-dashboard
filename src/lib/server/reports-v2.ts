import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	expensesHistory,
	goalAllocations,
	goals,
	incomeHistory,
	interestRates,
	snapshots,
} from "$lib/db/schema";
import {
	cardSplitSummary,
	chargeStatuses,
	stoozeStatus,
} from "$lib/server/credit-engine";
import { decryptTxDescription } from "$lib/server/crypto/protected-fields";
import {
	getDebtReport,
	getInterestReport,
	getMonthlySpend,
	getNetWorthHistory,
} from "$lib/server/reports";
import { formatCurrency } from "$lib/utils/currency";
import { asciiSparkline } from "$lib/utils/ascii-charts";
import { MS_PER_MONTH } from "$lib/utils/time-constants";

/**
 * Reports v2 (v3 B07, R10): separate dated reports, each a focused
 * interesting question, rendered in a science-paper structure
 * (title / abstract / method / findings) inside the terminal aesthetic —
 * structure borrowed, not LaTeX pastiche (Appendix C decision).
 *
 * A report is a pure server-side document: headline numbers computed by
 * the app's existing engines, an auto-written abstract with real figures,
 * a method block naming the data and the math, and findings as terminal
 * tables + optional figures (existing chart components, keyed).
 */

// ---------------------------------------------------------------------------
// Document shape
// ---------------------------------------------------------------------------

export type ReportFigure =
	| "netWorth"
	| "stackedArea"
	| "psaBullet"
	| "monthlySpend"
	| "categoryBars"
	| "debtWaterfall"
	| "none";

export interface ReportRow {
	label: string;
	value: string;
	/** semantic status colour; null = neutral */
	flag?: "green" | "amber" | "red" | null;
}

export interface ReportSection {
	heading: string;
	rows?: ReportRow[];
	notes?: string[];
	figure?: ReportFigure;
	/** extra figure payload key when a section needs the shared data */
	note?: string;
}

export interface ReportDoc {
	slug: string;
	title: string;
	/** Generation date, ISO — reports are written on demand */
	date: string;
	abstract: string;
	method: string[];
	findings: ReportSection[];
	/** shared figure data, shape depends on `figure` keys used */
	netWorthHistory?: { date: string; netWorthInCents: number; totalAssetsInCents: number; totalLiabilitiesInCents: number }[];
	interest?: {
		taxYearLabel: string;
		band: string;
		allowancePence: number;
		actualPence: number;
		projectedPence: number;
	} | null;
	monthlySpend?: {
		month: string;
		totalPence: number;
		categories: { name: string; colour: string; spentPence: number }[];
	}[];
	debt?: {
		goals: {
			name: string;
			slug: string;
			remainingInCents: number;
			projectedPayoffDate: string | null;
		}[];
		totalDebtInCents: number;
		totalMonthlyMinimumInCents: number;
		projectedDebtFreeDate: string | null;
	} | null;
}

export interface ReportDefinition {
	slug: string;
	title: string;
	/** One-line index blurb (the question the report asks) */
	blurb: string;
	build: (userId: number) => Promise<ReportDoc>;
}

const isoToday = () => new Date().toISOString().slice(0, 10);

function pct(part: number, whole: number): string {
	if (whole <= 0) return "—";
	return `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * Savings-rate flag by the REPORTED thresholds (≥20% green / 0–20% amber /
 * negative red). Rank (best/worst) must not override the scale — a 59.6%
 * "worst" month is still a green month (vision P1, sweep 9). Exported for
 * the regression test that pins this.
 */
export function savingsRateFlag(rate: number): "green" | "amber" | "red" {
	if (rate >= 0.2) return "green";
	if (rate >= 0) return "amber";
	return "red";
}

// ---------------------------------------------------------------------------
// Report: net-worth-trajectory
// ---------------------------------------------------------------------------

async function buildNetWorth(userId: number): Promise<ReportDoc> {
	const history = await getNetWorthHistory(userId);
	const date = isoToday();

	if (history.length < 2) {
		return {
			slug: "net-worth-trajectory",
			title: "Net Worth Trajectory",
			date,
			abstract:
				"Insufficient history — at least two snapshots are needed to speak of a trajectory.",
			method: ["Snapshots table, user-scoped", "Δ = latest − first over the window"],
			findings: [
				{ heading: "Findings", rows: [{ label: "snapshots available", value: String(history.length) }] },
			],
			netWorthHistory: history,
		};
	}

	const first = history[0];
	const latest = history[history.length - 1];
	const delta = latest.netWorthInCents - first.netWorthInCents;
	const window = `${first.date} → ${latest.date}`;

	// best/worst month-over-month step
	let bestStep = { date: "", delta: -Infinity };
	let worstStep = { date: "", delta: Infinity };
	for (let i = 1; i < history.length; i++) {
		const step = history[i].netWorthInCents - history[i - 1].netWorthInCents;
		if (step > bestStep.delta) bestStep = { date: history[i].date, delta: step };
		if (step < worstStep.delta) worstStep = { date: history[i].date, delta: step };
	}
	// A monotonic window has no rise (or no fall) — never label one with
	// the other's sign.
	const hasRise = bestStep.delta > 0;
	const hasFall = worstStep.delta < 0;
	const biggestStep = hasFall && (!hasRise || Math.abs(worstStep.delta) > Math.abs(bestStep.delta))
		? { ...worstStep, kind: "fall" as const }
		: { ...bestStep, kind: "rise" as const };

	const assetsDelta = latest.totalAssetsInCents - first.totalAssetsInCents;
	const liabsDelta = latest.totalLiabilitiesInCents - first.totalLiabilitiesInCents;

	return {
		slug: "net-worth-trajectory",
		title: "Net Worth Trajectory",
		date,
		abstract: `Net worth stands at ${formatCurrency(latest.netWorthInCents)} as of ${latest.date}, a change of ${delta >= 0 ? "+" : ""}${formatCurrency(delta)} since ${first.date}. Over the window, assets moved ${assetsDelta >= 0 ? "+" : ""}${formatCurrency(assetsDelta)} against liabilities ${liabsDelta <= 0 ? "" : "+"}${formatCurrency(liabsDelta)}; the largest single step was a ${biggestStep.kind} of ${formatCurrency(Math.abs(biggestStep.delta))} (${biggestStep.date}).`,
		method: [
			`Data: net worth snapshots, ${history.length} observations (${window})`,
			"Δ computed between first and latest observations; step analysis between consecutive snapshots",
			"Amounts are stored pence; displayed rounded to pounds",
		],
		findings: [
			{
				heading: "Headline numbers",
				rows: [
					{ label: `net worth @ ${latest.date}`, value: formatCurrency(latest.netWorthInCents), flag: latest.netWorthInCents >= 0 ? "green" : "red" },
					{ label: `change since ${first.date}`, value: `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`, flag: delta >= 0 ? "green" : "red" },
					{ label: "assets", value: formatCurrency(latest.totalAssetsInCents) },
					{ label: "liabilities", value: formatCurrency(latest.totalLiabilitiesInCents), flag: latest.totalLiabilitiesInCents > 0 ? "amber" : null },
					...(hasRise
						? [{ label: "largest rise", value: `${formatCurrency(bestStep.delta)} (${bestStep.date})`, flag: "green" as const }]
						: []),
					...(hasFall
						? [{ label: "largest fall", value: `${formatCurrency(worstStep.delta)} (${worstStep.date})`, flag: "red" as const }]
						: []),
				],
			},
			{
				heading: "Composition over time",
				figure: "stackedArea",
				notes: ["Assets and liabilities stacked — the gap between the two bands is the net worth line."],
			},
			{
				heading: "Trajectory",
				figure: "netWorth",
			},
		],
		netWorthHistory: history,
	};
}

// ---------------------------------------------------------------------------
// Report: savings-rate
// ---------------------------------------------------------------------------

async function buildSavingsRate(userId: number): Promise<ReportDoc> {
	const [incomeRows, expenseRows] = await Promise.all([
		db
			.select({ month: incomeHistory.month, cents: incomeHistory.grossIncomeInCents })
			.from(incomeHistory)
			.where(withUserFilter(userId, incomeHistory))
			.orderBy(desc(incomeHistory.month))
			.limit(12),
		db
			.select({ month: expensesHistory.month, cents: expensesHistory.monthlyExpensesInCents })
			.from(expensesHistory)
			.where(withUserFilter(userId, expensesHistory))
			.orderBy(desc(expensesHistory.month))
			.limit(12),
	]);

	const date = isoToday();
	const byMonth = new Map<string, { income: number | null; expenses: number | null }>();
	for (const row of incomeRows) {
		const entry = byMonth.get(row.month) ?? { income: null, expenses: null };
		entry.income = row.cents;
		byMonth.set(row.month, entry);
	}
	for (const row of expenseRows) {
		const entry = byMonth.get(row.month) ?? { income: null, expenses: null };
		entry.expenses = row.cents;
		byMonth.set(row.month, entry);
	}
	const months = [...byMonth.keys()].sort().reverse();
	const paired = months.filter((m) => {
		const e = byMonth.get(m);
		return e?.income !== null && e?.income !== undefined && e?.expenses !== null && e?.expenses !== undefined;
	});

	if (paired.length === 0) {
		return {
			slug: "savings-rate",
			title: "Savings Rate & Runway",
			date,
			abstract:
				"No months have both declared income and declared expenses — record at least one month of each to compute a savings rate.",
			method: [
				"Data: income_history and expenses_history (user-scoped, last 12 months)",
				"savings rate = (income − expenses) / income",
				"runway = liquid assets ÷ monthly expenses (needs account data)",
			],
			findings: [{ heading: "Findings", rows: [{ label: "paired months", value: "0" }] }],
		};
	}

	const rates = paired.map((month) => {
		const { income, expenses } = byMonth.get(month)!;
		return { month, income: income!, expenses: expenses!, rate: (income! - expenses!) / income! };
	});
	const avgRate = rates.reduce((sum, r) => sum + r.rate, 0) / rates.length;
	const best = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
	const worst = rates.reduce((a, b) => (b.rate < a.rate ? b : a));
	const totalSaved = rates.reduce((sum, r) => sum + r.income - r.expenses, 0);
	const meanMonthlyExpenses = rates.reduce((sum, r) => sum + r.expenses, 0) / rates.length;

	// Rate flags use the REPORTED thresholds (≥20% green / 0–20% amber /
	// negative red) — rank (best/worst) must not override the scale a
	// 59.6% "worst" month is still a green month (vision P1, sweep 9).
	// savingsRateFlag is module-level + exported for the regression test.

	// Runway: liquid (current-account) balances from the latest snapshot ÷
	// mean declared monthly expenses — the number the title promises.
	const latestSnapshot = await db
		.select({
			snapshotDate: snapshots.snapshotDate,
			accountsBreakdown: snapshots.accountsBreakdown,
		})
		.from(snapshots)
		.where(withUserFilter(userId, snapshots))
		.orderBy(desc(snapshots.snapshotDate))
		.limit(1);
	const liquidCents =
		(latestSnapshot[0]?.accountsBreakdown?.accounts ?? [])
			.filter((a) => a.type === "current" && a.includedInTotal)
			.reduce((sum, a) => sum + a.balanceInCents, 0) || 0;
	const runwayMonths =
		meanMonthlyExpenses > 0 ? liquidCents / meanMonthlyExpenses : null;

	return {
		slug: "savings-rate",
		title: "Savings Rate & Runway",
		date,
		abstract: `Across ${rates.length} declared month${rates.length !== 1 ? "s" : ""}, the mean savings rate is ${pct(avgRate * 100, 100) === "—" ? "—" : `${(avgRate * 100).toFixed(1)}%`}, with a best of ${(best.rate * 100).toFixed(1)}% (${best.month}) and a worst of ${(worst.rate * 100).toFixed(1)}% (${worst.month}). Total declared surplus: ${formatCurrency(totalSaved)}${runwayMonths === null ? "" : `. Runway at declared spend: ${runwayMonths.toFixed(1)} months.`}`,
		method: [
			`Data: income_history + expenses_history, ${rates.length} paired months of the last 12`,
			"savings rate = (gross income − declared expenses) / gross income, per month",
			"mean rate is unweighted across months (not income-weighted)",
		],
		findings: [
			{
				heading: "Monthly rates",
				rows: rates
					.slice()
					.reverse()
					.map((r) => ({
						label: r.month,
						value: `${(r.rate * 100).toFixed(1)}% · ${formatCurrency(r.income - r.expenses)} saved`,
						flag: savingsRateFlag(r.rate),
					})),
			},
			{
				heading: "Extremes",
				rows: [
					{ label: "mean rate", value: `${(avgRate * 100).toFixed(1)}%`, flag: savingsRateFlag(avgRate) },
					{ label: `best ${best.month}`, value: `${(best.rate * 100).toFixed(1)}%`, flag: savingsRateFlag(best.rate) },
					{ label: `worst ${worst.month}`, value: `${(worst.rate * 100).toFixed(1)}%`, flag: savingsRateFlag(worst.rate) },
					{ label: "total surplus (declared)", value: formatCurrency(totalSaved) },
				],
				notes: [
					"A negative month means declared expenses exceeded declared income — savings were drawn down.",
					"Rate thresholds: ≥20% green, 0–20% amber, negative red — the same scale colours best/worst.",
				],
			},
			{
				heading: "Runway",
				rows: [
					{
						label: "liquid balances (current accounts)",
						value: latestSnapshot[0]
							? `${formatCurrency(liquidCents)} · snapshot ${latestSnapshot[0].snapshotDate}`
							: "no snapshot yet",
					},
					{
						label: "mean declared monthly expenses",
						value: formatCurrency(meanMonthlyExpenses),
					},
					{
						label: "runway",
						value:
							runwayMonths === null
								? "— (no declared expenses)"
								: `${runwayMonths.toFixed(1)} months of cover`,
						flag:
							runwayMonths === null
								? undefined
								: runwayMonths >= 6
									? ("green" as const)
									: runwayMonths >= 3
										? ("amber" as const)
										: ("red" as const),
					},
				],
				notes: [
					"Runway = current-account balances from the latest snapshot ÷ mean declared monthly expenses.",
					"Declared expenses only — debt payments tracked as transactions are not included.",
					"Thresholds: ≥6 months green, 3–6 amber, <3 red.",
				],
			},
		],
	};
}

// ---------------------------------------------------------------------------
// Report: interest-vs-allowance
// ---------------------------------------------------------------------------

async function buildInterest(userId: number): Promise<ReportDoc> {
	const report = await getInterestReport(userId);
	const date = isoToday();
	const headroom = report.psaAllowanceInCents - report.forecastTaxableInCents;

	return {
		slug: "interest-vs-allowance",
		title: "Interest vs the Personal Savings Allowance",
		date,
		abstract: `Taxable interest for ${report.taxYearLabel} is tracking at ${formatCurrency(report.forecastTaxableInCents)} (actual ${formatCurrency(report.actualTaxableInCents)} + projected ${formatCurrency(report.projectedTaxableInCents)}) against a ${report.band}-band allowance of ${formatCurrency(report.psaAllowanceInCents)} — ${headroom >= 0 ? `${formatCurrency(headroom)} of headroom` : `${formatCurrency(-headroom)} OVER the allowance`}.`,
		method: [
			`Data: interest breakdown engine, tax year ${report.taxYearLabel} (6 Apr → 5 Apr)`,
			`PSA by band: £1,000 basic / £500 higher / £0 additional — resolved band: ${report.band}`,
			"forecast = actual (to date) + projected (annualised from rates to 5 Apr)",
		],
		findings: [
			{
				heading: "Allowance math",
				figure: "psaBullet",
			},
			{
				heading: "Numbers",
				rows: [
					{ label: "tax year", value: report.taxYearLabel },
					{ label: "band", value: String(report.band) },
					{ label: "allowance", value: formatCurrency(report.psaAllowanceInCents) },
					{ label: "actual taxable", value: formatCurrency(report.actualTaxableInCents) },
					{ label: "projected taxable", value: formatCurrency(report.projectedTaxableInCents) },
					{ label: "forecast total", value: formatCurrency(report.forecastTaxableInCents), flag: headroom >= 0 ? "green" : "red" },
					{ label: "headroom", value: `${headroom >= 0 ? "+" : ""}${formatCurrency(headroom)}`, flag: headroom >= 0 ? "green" : "red" },
					{ label: "tax-free (ISA) actual + projected", value: formatCurrency(report.actualTaxFreeInCents + report.projectedTaxFreeInCents) },
				],
				notes: [
					"Interest inside ISAs does not consume the allowance — the tax-free row is informational.",
				],
			},
		],
		interest: {
			taxYearLabel: report.taxYearLabel,
			band: String(report.band),
			allowancePence: report.psaAllowanceInCents,
			actualPence: report.actualTaxableInCents,
			projectedPence: report.projectedTaxableInCents,
		},
	};
}

// ---------------------------------------------------------------------------
// Report: credit-strategy
// ---------------------------------------------------------------------------

async function buildCreditStrategy(userId: number): Promise<ReportDoc> {
	const cards = await db
		.select({
			id: accounts.id,
			slug: accounts.slug,
			name: accounts.name,
			creditMode: accounts.creditMode,
			promoEndsAt: accounts.promoEndsAt,
			revertAprBps: accounts.revertAprBps,
		})
		.from(accounts)
		.where(
			and(
				withUserFilter(userId, accounts),
				eq(accounts.type, "credit-card"),
			),
		);

	const date = isoToday();
	if (cards.length === 0) {
		return {
			slug: "credit-strategy",
			title: "Credit Strategy — Stoozing & Payoff Pressure",
			date,
			abstract: "No credit-card accounts exist — there is no credit strategy to report.",
			method: ["Data: credit-card accounts + their transactions through the credit engine"],
			findings: [{ heading: "Findings", rows: [{ label: "cards", value: "0" }] }],
		};
	}

	const today = new Date();
	const sections: ReportSection[] = [];
	let totalStoozed = 0;
	let totalBehind = 0;
	let totalOnTrack = 0;

	for (const card of cards) {
		const tx = await db
			.select({
				id: accountTransactions.id,
				slug: accountTransactions.slug,
				description: accountTransactions.description,
				type: accountTransactions.type,
				amount: accountTransactions.amount,
				payoffPlan: accountTransactions.payoffPlan,
				plannedClearBy: accountTransactions.plannedClearBy,
				allocatesToId: accountTransactions.allocatesToId,
				transactionDate: accountTransactions.transactionDate,
			})
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, card.id))
			.orderBy(desc(accountTransactions.transactionDate));

		const charges = tx
			.filter((t) => t.type === "charge")
			.map((t) => ({
				id: t.id,
				amountPence: Math.abs(t.amount),
				date: t.transactionDate,
				payoffPlan: t.payoffPlan,
				plannedClearBy: t.plannedClearBy,
			}));
		const payments = tx
			.filter((t) => t.type === "payment")
			.map((t) => ({
				id: t.id,
				amountPence: Math.abs(t.amount),
				date: t.transactionDate,
				allocatesToId: t.allocatesToId,
			}));

		const engineAccount = {
			creditMode: card.creditMode,
			promoEndsAt: card.promoEndsAt,
			revertAprBps: card.revertAprBps,
		};
		const statuses = chargeStatuses(charges, payments, engineAccount, today);
		const summary = cardSplitSummary(charges, payments, engineAccount, today);
		const outstanding = statuses.reduce(
			(sum, s) => sum + Math.max(0, s.remainingPence),
			0,
		);
		const stooze = stoozeStatus(engineAccount, outstanding, today);

		const rows: ReportRow[] = [
			{ label: "mode", value: card.creditMode ?? "unset", flag: card.creditMode === "panic" ? "amber" : card.creditMode === "stooze" ? "green" : null },
			{ label: "outstanding (charges)", value: formatCurrency(outstanding) },
			{ label: "cleared / on-track / behind", value: `${summary.clearedCount} / ${summary.onTrackCount} / ${summary.behindCount}`, flag: summary.behindCount > 0 ? "red" : "green" },
		];
		if (stooze.stoozing && stooze.clearBy && stooze.daysLeft !== null) {
			totalStoozed += outstanding;
			rows.push({
				label: "0% ends",
				value: `${(stooze.promoEndsAt ?? new Date()).toISOString().slice(0, 10)} (${stooze.daysLeft} days)`,
				flag: stooze.daysLeft <= 30 ? "red" : stooze.daysLeft <= 60 ? "amber" : "green",
			});
			rows.push({
				label: "have ready / pay by",
				value: `${formatCurrency(stooze.clearAmountPence ?? outstanding)} · ${stooze.clearBy.toISOString().slice(0, 10)}`,
			});
		}
		if (summary.totalFlexCostPence > 0) {
			rows.push({
				label: "interest already accrued (late)",
				value: formatCurrency(summary.totalFlexCostPence),
				flag: "red",
			});
		}
		sections.push({
			heading: `${card.name} (${card.slug.slice(0, 8)})`,
			rows,
			notes: statuses
				.filter((s) => s.remainingPence > 0 && !s.onTrack)
				.slice(0, 3)
				.map(
					(s) =>
						`A charge with ${formatCurrency(s.remainingPence)} remaining is behind its ${s.deadline.toISOString().slice(0, 10)} 3-month target — ${formatCurrency(s.requiredPerMonthPence)}/mo would hit it${stooze.stoozing ? `; the stooze plan needs no monthly payments, only ${formatCurrency(stooze.clearAmountPence ?? s.remainingPence)} by ${stooze.clearBy?.toISOString().slice(0, 10)}` : ""}.`,
				),
		});
		totalBehind += summary.behindCount;
		totalOnTrack += summary.onTrackCount;
	}

	return {
		slug: "credit-strategy",
		title: "Credit Strategy — Stoozing & Payoff Pressure",
		date,
		abstract: `${cards.length} card${cards.length !== 1 ? "s" : ""} tracked: ${totalOnTrack} charge plan${totalOnTrack !== 1 ? "s" : ""} on track, ${totalBehind} behind. ${totalStoozed > 0 ? `${formatCurrency(totalStoozed)} is riding 0% promos — the strategy is earning interest on the bank's money, provided clear-by dates hold.` : "No balances are riding promotional 0% windows."}`,
		method: [
			"Data: credit-card accounts + their charge/payment transactions (user-scoped)",
			"Credit engine: statement-delay horizon = confirmed-through last month-end; 3-month payoff targets; waterfall payment allocation",
			"stoozeStatus clear-by = promo end − 5 days (payment clearing buffer)",
		],
		findings: sections,
	};
}

// ---------------------------------------------------------------------------
// Report: spending-profile
// ---------------------------------------------------------------------------

async function buildSpendingProfile(userId: number): Promise<ReportDoc> {
	const monthlySpend = await getMonthlySpend(userId, 6);
	const date = isoToday();
	const complete = monthlySpend.filter((m) => m.totalPence > 0);
	const latest = complete[complete.length - 1];

	if (!latest) {
		return {
			slug: "spending-profile",
			title: "Spending Profile — Where the Money Goes",
			date,
			abstract: "No categorised spending recorded in the last six months — nothing to profile yet.",
			method: ["Data: budget category breakdown (budget-type filter, refund-aware) per calendar month"],
			findings: [{ heading: "Findings", rows: [{ label: "months with spend", value: "0" }] }],
			monthlySpend,
		};
	}

	const avg = complete.reduce((s, m) => s + m.totalPence, 0) / complete.length;
	const top = latest.categories[0];
	const topShare = pct(top.spentPence, latest.totalPence);
	const topCategories = latest.categories.slice(0, 5);

	return {
		slug: "spending-profile",
		title: "Spending Profile — Where the Money Goes",
		date,
		abstract: `Six-month spending averages ${formatCurrency(avg)}/mo. In ${latest.month}, ${top.name} took ${topShare} of the month (${formatCurrency(top.spentPence)} of ${formatCurrency(latest.totalPence)}) across ${latest.categories.length} active categories.`,
		method: [
			"Data: category breakdown for the last 6 calendar months (budget definition: type-filtered, excluded accounts honoured, refunds netted)",
			"category share = category spend ÷ month total; mean is over months with spend",
		],
		findings: [
			{
				heading: `Top categories — ${latest.month}`,
				figure: "categoryBars",
			},
			{
				heading: "Month totals",
				figure: "monthlySpend",
			},
			{
				heading: "Numbers",
				rows: [
					{ label: "months with recorded spend", value: `${complete.length} / 6` },
					{ label: "mean monthly spend", value: `${formatCurrency(avg)}/mo` },
					{ label: `latest (${latest.month})`, value: formatCurrency(latest.totalPence) },
					{ label: `${top.name} share of ${latest.month}`, value: topShare, flag: "amber" },
					...topCategories.map((c) => ({
						label: `· ${c.name}`,
						value: `${formatCurrency(c.spentPence)} (${pct(c.spentPence, latest.totalPence)})`,
					})),
				],
			},
		],
		monthlySpend,
	};
}

// ---------------------------------------------------------------------------
// Report: debt-horizon
// ---------------------------------------------------------------------------

async function buildDebtHorizon(userId: number): Promise<ReportDoc> {
	const debt = await getDebtReport(userId);
	const date = isoToday();

	if (debt.goals.length === 0) {
		return {
			slug: "debt-horizon",
			title: "Debt Horizon",
			date,
			abstract: "No debt goals are being tracked — the horizon is clear.",
			method: ["Data: debt goals + linked account balances + minimum payments (snowball order)"],
			findings: [{ heading: "Findings", rows: [{ label: "tracked debt goals", value: "0" }] }],
		};
	}

	// months until the LAST goal clears (the engine's actual model: each
	// goal projected at its own minimum — no snowball rolling). v3.1
	// third mandate: the abstract used to juxtapose the POOLED figure
	// (total/total-mins) with the per-goal max date — two different models
	// read as a contradiction ("20 months" vs "2034"). State one model.
	const payoffDates = debt.goals
		.map((g) => g.projectedPayoffDate)
		.filter((d): d is Date => d !== null);
	const monthsToDebtFree = payoffDates.length
		? Math.max(
				...payoffDates.map((d) => Math.ceil((d.getTime() - Date.now()) / MS_PER_MONTH)),
			)
		: null;

	return {
		slug: "debt-horizon",
		title: "Debt Horizon",
		date,
		abstract: `${formatCurrency(debt.totalDebtInCents)} of debt across ${debt.goals.length} tracked goal${debt.goals.length !== 1 ? "s" : ""}, with minimum payments of ${formatCurrency(debt.totalMonthlyMinimumInCents)}/mo. ${debt.projectedDebtFreeDate ? `Paying minimums only, the last goal clears ${debt.projectedDebtFreeDate.toISOString().slice(0, 10)} (${monthsToDebtFree} months) — no snowball rolling.` : "No projection until payment schedules are set."}`,
		method: [
			"Data: debt goals with linked accounts (balances, minimum payment rules)",
			"Waterfall order: smallest balance first (snowball)",
			"projection = each goal at its OWN minimum payment (independent schedules — freed minimums are NOT rolled forward)",
		],
		findings: [
			{
				heading: "Waterfall",
				figure: "debtWaterfall",
			},
			{
				heading: "Numbers",
				rows: [
					{ label: "total debt", value: formatCurrency(debt.totalDebtInCents), flag: "amber" },
					{ label: "monthly minimums", value: `${formatCurrency(debt.totalMonthlyMinimumInCents)}/mo` },
					...(monthsToDebtFree
						? [{ label: "months to debt-free (at minimums)", value: String(monthsToDebtFree), flag: "amber" as const }]
						: []),
					{ label: "projected debt-free", value: debt.projectedDebtFreeDate ? debt.projectedDebtFreeDate.toISOString().slice(0, 10) : "—", flag: debt.projectedDebtFreeDate ? "green" : null },
					...debt.goals.map((g) => ({
						label: `· ${g.name}`,
						value: `${formatCurrency(g.remainingInCents)}${g.projectedPayoffDate ? ` → ${g.projectedPayoffDate.toISOString().slice(0, 10)}` : ""}`,
					})),
				],
			},
		],
		debt: {
			goals: debt.goals.map((g) => ({
				name: g.name,
				slug: g.slug,
				remainingInCents: g.remainingInCents,
				projectedPayoffDate: g.projectedPayoffDate
					? g.projectedPayoffDate.toISOString().slice(0, 10)
					: null,
			})),
			totalDebtInCents: debt.totalDebtInCents,
			totalMonthlyMinimumInCents: debt.totalMonthlyMinimumInCents,
			projectedDebtFreeDate: debt.projectedDebtFreeDate
				? debt.projectedDebtFreeDate.toISOString().slice(0, 10)
				: null,
		},
	};
}

// ---------------------------------------------------------------------------
// Report: income-vs-deposits (R24 — derived payslip review)
// ---------------------------------------------------------------------------

async function buildIncomeVsDeposits(userId: number): Promise<ReportDoc> {
	const [incomeRows, depositRows] = await Promise.all([
		db
			.select({ month: incomeHistory.month, cents: incomeHistory.grossIncomeInCents })
			.from(incomeHistory)
			.where(withUserFilter(userId, incomeHistory))
			.orderBy(desc(incomeHistory.month))
			.limit(12),
		db
			.select({
				month: sql<string>`strftime('%Y-%m', ${accountTransactions.transactionDate}, 'unixepoch')`,
				cents: sql<number>`sum(${accountTransactions.amount})`,
			})
			.from(accountTransactions)
			.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
			.where(
				and(
					withUserFilter(userId, accounts),
					isNull(accounts.deletedAt),
					eq(accountTransactions.type, "deposit"),
				),
			)
			.groupBy(sql`strftime('%Y-%m', ${accountTransactions.transactionDate}, 'unixepoch')`)
			.orderBy(desc(sql`strftime('%Y-%m', ${accountTransactions.transactionDate}, 'unixepoch')`))
			.limit(12),
	]);

	const date = isoToday();
	const depositsByMonth = new Map(
		depositRows.map((r) => [r.month, Number(r.cents)]),
	);
	const months = incomeRows.map((r) => r.month);
	if (months.length === 0) {
		return {
			slug: "income-vs-deposits",
			title: "Income vs Deposit Evidence",
			date,
			abstract:
				"No declared income months on record — declare income in Income History to run the payslip review.",
			method: [
				"Data: income_history (declared gross) vs deposit transactions per month",
				"gap = declared − deposits; both directions are interesting",
			],
			findings: [{ heading: "Findings", rows: [{ label: "declared months", value: "0" }] }],
		};
	}

	const rows = months.map((month) => {
		const declared = incomeRows.find((r) => r.month === month)!.cents;
		const deposited = depositsByMonth.get(month) ?? 0;
		const gap = declared - deposited;
		return { month, declared, deposited, gap };
	});
	const mismatches = rows.filter((r) => r.declared > 0 && Math.abs(r.gap) > 100_00);
	const totalGap = rows.reduce((sum, r) => sum + r.gap, 0);

	// v3.1 A09 (vision C+ finding): diagnose the LARGEST gap month — its
	// biggest actual deposits, so the anomaly reads as evidence, not just a
	// flag. Descriptions are encrypted at rest → decrypt before display.
	const worstMonth = mismatches.length > 0
		? mismatches.reduce((a, b) => (Math.abs(b.gap) > Math.abs(a.gap) ? b : a))
		: null;
	let worstMonthDeposits: Array<{ description: string; amount: number }> = [];
	if (worstMonth) {
		const [y, m] = worstMonth.month.split("-").map(Number);
		const monthStart = new Date(Date.UTC(y, m - 1, 1));
		const monthEnd = new Date(Date.UTC(y, m, 1));
		const txRows = await db
			.select({
				slug: accountTransactions.slug,
				description: accountTransactions.description,
				amount: accountTransactions.amount,
			})
			.from(accountTransactions)
			.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
			.where(
				and(
					withUserFilter(userId, accounts),
					isNull(accounts.deletedAt),
					eq(accountTransactions.type, "deposit"),
					gte(accountTransactions.transactionDate, monthStart),
					lt(accountTransactions.transactionDate, monthEnd),
				),
			);
		worstMonthDeposits = txRows
			.map((t) => ({
				description: decryptTxDescription(userId, t.slug, t.description) ?? "(no description)",
				amount: t.amount,
			}))
			.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
			.slice(0, 3);
	}

	return {
		slug: "income-vs-deposits",
		title: "Income vs Deposit Evidence",
		date,
		abstract: `${rows.length} declared month${rows.length !== 1 ? "s" : ""} checked against actual deposits: ${mismatches.length} differ by more than £100${mismatches.length > 0 ? ` (largest: ${formatCurrency(Math.max(...mismatches.map((m) => Math.abs(m.gap))))} in ${mismatches.reduce((a, b) => (Math.abs(b.gap) > Math.abs(a.gap) ? b : a)).month})` : ""}. Net declared-minus-deposited across the window: ${formatCurrency(totalGap)}.`,
		method: [
			"Data: income_history (declared gross per month) + deposit-type transactions grouped by month",
			"gap = declared gross − deposited total; interest/refunds excluded by the deposit type filter",
			"threshold: |gap| > £100 flags a month (payslip splits, timing, or a missed deposit)",
		],
		findings: [
			{
				heading: "Monthly comparison",
				rows: rows.reverse().map((r) => ({
					label: r.month,
					value: `declared ${formatCurrency(r.declared)} · deposited ${formatCurrency(r.deposited)} · gap ${r.gap >= 0 ? "+" : ""}${formatCurrency(r.gap)}`,
					flag:
						r.declared > 0 && Math.abs(r.gap) > 100_00
							? ("amber" as const)
							: null,
				})),
			},
			...(worstMonth && worstMonthDeposits.length > 0
				? [
						{
							heading: `Largest gap opened up — ${worstMonth.month}`,
							rows: worstMonthDeposits.map((d) => ({
								label: d.description,
								value: formatCurrency(d.amount),
							})),
							notes: [
								`The ${worstMonth.deposited > worstMonth.declared ? "excess" : "shortfall"} month's biggest deposits — compare each against what the payslip declared before hunting further.`,
							],
						},
					]
				: []),
			{
				heading: "Reading the gaps",
				notes: [
					"A persistent positive gap: declared income never reaches the accounts — payslip splits (bonus, shares, pension salary sacrifice) or an out-of-app account.",
					"A negative gap: deposits exceed declared income — reimbursements typed as deposits, or the declared month is understated.",
					"This is the derived payslip review: no payslip files to import, the evidence is your own transaction ledger (R24 decision).",
				],
			},
		],
	};
}

// ---------------------------------------------------------------------------
// Report: rate-shop (R-H17) — deposits earning below your OWN best rate
// ---------------------------------------------------------------------------

async function buildRateShop(userId: number): Promise<ReportDoc> {
	const date = isoToday();

	// Open savings accounts (rates live on interest_rates; balances from
	// the latest snapshot breakdown — the same point-in-time source the
	// runway section uses).
	const rows = await db
		.select({
			id: accounts.id,
			name: accounts.name,
			taxWrapper: accounts.taxWrapper,
			liquidity: accounts.liquidity,
			rateBps: interestRates.rate,
			effectiveFrom: interestRates.effectiveFrom,
		})
		.from(accounts)
		.leftJoin(
			interestRates,
			and(
				eq(interestRates.accountId, accounts.id),
				eq(
					interestRates.effectiveFrom,
					db
						.select({ max: sql`max(${interestRates.effectiveFrom})` })
						.from(interestRates)
						.where(eq(interestRates.accountId, accounts.id)),
				),
			),
		)
		.where(
			and(
				withUserFilter(userId, accounts),
				isNull(accounts.deletedAt),
				isNull(accounts.closedAt),
				eq(accounts.category, "asset"),
				eq(accounts.type, "savings"),
			),
		);

	const latestSnapshot = await db
		.select({ accountsBreakdown: snapshots.accountsBreakdown })
		.from(snapshots)
		.where(withUserFilter(userId, snapshots))
		.orderBy(desc(snapshots.snapshotDate))
		.limit(1);
	const balanceBySlug = new Map(
		(latestSnapshot[0]?.accountsBreakdown?.accounts ?? []).map((a) => [a.accountSlug, a.balanceInCents]),
	);
	// name → balance (slug not selected above; names are unique enough for report prose)
	const balanceByName = new Map(
		(latestSnapshot[0]?.accountsBreakdown?.accounts ?? []).map((a) => [a.name, a.balanceInCents]),
	);

	const withData = rows
		.map((r) => ({
			name: r.name,
			wrapper: r.taxWrapper === "isa" ? ("isa" as const) : ("taxable" as const),
			rateBps: r.rateBps ?? 0,
			liquidity: r.liquidity,
			balanceInCents: balanceByName.get(r.name) ?? 0,
		}))
		.filter((r) => r.balanceInCents > 0);

	const bestByWrapper = new Map<string, number>();
	for (const r of withData) {
		if (r.rateBps > (bestByWrapper.get(r.wrapper) ?? 0)) {
			bestByWrapper.set(r.wrapper, r.rateBps);
		}
	}

	if (withData.length === 0) {
		return {
			slug: "rate-shop",
			title: "Rate Shop — Your Own Best Rates",
			date,
			abstract:
				"No open savings accounts with a balance in the latest snapshot — nothing to shop.",
			method: ["Data: open savings accounts × latest snapshot balances × current rates"],
			findings: [{ heading: "Findings", rows: [{ label: "accounts", value: "0" }] }],
		};
	}

	const lagging = withData.filter(
		(r) => r.rateBps < (bestByWrapper.get(r.wrapper) ?? 0),
	);
	const forgone = (r: (typeof withData)[number]) =>
		Math.round((r.balanceInCents * ((bestByWrapper.get(r.wrapper) ?? 0) - r.rateBps)) / 10_000);
	const leftOnTable = lagging.reduce((sum, r) => sum + forgone(r), 0);
	// Actionable now: instant/delayed liquidity only — locked terms wait
	// for renewal (vision P1: the abstract must not promise locked money).
	const movable = lagging.filter((r) => r.liquidity !== "locked");
	const movableTotal = movable.reduce((sum, r) => sum + forgone(r), 0);

	return {
		slug: "rate-shop",
		title: "Rate Shop — Your Own Best Rates",
		date,
		abstract: lagging.length
			? `${lagging.length} of ${withData.length} savings ${lagging.length === 1 ? "account holds" : "accounts hold"} deposits below your own best same-wrapper rate — ~${formatCurrency(movableTotal)} a year is movable today${leftOnTable - movableTotal > 0 ? `, plus ~${formatCurrency(leftOnTable - movableTotal)} more when fixed terms renew` : ""}.`
			: `Every savings deposit already earns its wrapper's best recorded rate — ${withData.length} account${withData.length !== 1 ? "s" : ""} checked, nothing left on the table.`,
		method: [
			"Data: open savings accounts, current effective rate per account (latest interest_rates row), balances from the latest snapshot breakdown",
			"best rate = the highest current rate among your own accounts within the same tax treatment (ISA vs taxable — money cannot switch wrappers for free)",
			"left on the table = balance × (best − current rate), simple yearly figure, no compounding",
		],
		findings: [
			{
				heading: "Rates vs your best",
				rows: withData
					.slice()
					.sort((a, b) => a.balanceInCents - b.balanceInCents)
					.reverse()
					.map((r) => {
						const best = bestByWrapper.get(r.wrapper) ?? 0;
						const gapBps = best - r.rateBps;
						return {
							label: `${r.name} (${r.wrapper})`,
							value: `${(r.rateBps / 100).toFixed(2)}% vs best ${(best / 100).toFixed(2)}% · ${formatCurrency(r.balanceInCents)}`,
							flag: gapBps > 25 ? ("red" as const) : gapBps > 0 ? ("amber" as const) : ("green" as const),
						};
					}),
			},
			{
				heading: "Left on the table",
				rows: [
					{ label: "accounts below best", value: `${lagging.length} of ${withData.length}` },
					{ label: "movable now (instant/delayed)", value: `${movable.length} · ~${formatCurrency(movableTotal)}/yr`, flag: movableTotal > 0 ? ("amber" as const) : ("green" as const) },
					{ label: "yearly interest forgone (approx, all)", value: formatCurrency(leftOnTable) },
				],
				notes: [
					"Fixed-term (locked) accounts cannot be switched mid-term — their share arrives at next renewal, which is why movable-now is split out above.",
					"Rates are the ones you recorded; the shop only compares against products you already hold (no market data).",
				],
			},
		],
	};
}

// ---------------------------------------------------------------------------
// Report: net-worth-seasonality (R-H18) — which calendar months move the
// number, from the user's own snapshot history
// ---------------------------------------------------------------------------

export interface SeasonalityMonth {
	/** 0 = Jan … 11 = Dec */
	monthOfYear: number;
	meanDeltaPence: number;
	samples: number;
}

export interface SeasonalityResult {
	status: "ok" | "too-little";
	steps: number;
	months: SeasonalityMonth[];
	weakest: SeasonalityMonth | null;
	strongest: SeasonalityMonth | null;
}

/** Pure seasonality math (exported for hand-computed tests): consecutive
 *  monthly deltas (25–40d gaps only) grouped by the calendar month they
 *  end in; months need ≥2 observations to report. */
export function seasonalityFromHistory(
	history: { date: string; netWorthInCents: number }[],
): SeasonalityResult {
	const deltas: { monthOfYear: number; delta: number }[] = [];
	for (let i = 1; i < history.length; i++) {
		const prev = new Date(`${history[i - 1].date}T00:00:00.000Z`);
		const curr = new Date(`${history[i].date}T00:00:00.000Z`);
		const days = (curr.getTime() - prev.getTime()) / 86_400_000;
		if (days < 25 || days > 40) continue;
		deltas.push({
			monthOfYear: curr.getUTCMonth(),
			delta: history[i].netWorthInCents - history[i - 1].netWorthInCents,
		});
	}

	const byMonth = new Map<number, number[]>();
	for (const d of deltas) {
		const list = byMonth.get(d.monthOfYear) ?? [];
		list.push(d.delta);
		byMonth.set(d.monthOfYear, list);
	}

	const months = [...byMonth.entries()]
		.filter(([, list]) => list.length >= 2)
		.map(([month, list]) => ({
			monthOfYear: month,
			meanDeltaPence: Math.round(list.reduce((s, d) => s + d, 0) / list.length),
			samples: list.length,
		}))
		.sort((a, b) => a.monthOfYear - b.monthOfYear);

	if (history.length < 13 || months.length < 4) {
		return { status: "too-little", steps: deltas.length, months, weakest: null, strongest: null };
	}

	const sorted = months.slice().sort((a, b) => a.meanDeltaPence - b.meanDeltaPence);
	return {
		status: "ok",
		steps: deltas.length,
		months,
		weakest: sorted[0],
		strongest: sorted[sorted.length - 1],
	};
}

async function buildSeasonality(userId: number): Promise<ReportDoc> {
	const date = isoToday();
	const history = await getNetWorthHistory(userId);
	const result = seasonalityFromHistory(history);
	const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

	if (result.status !== "ok" || !result.weakest || !result.strongest) {
		return {
			slug: "net-worth-seasonality",
			title: "Net-Worth Seasonality",
			date,
			abstract:
				history.length < 13
					? "Seasonality needs at least 13 monthly snapshots (a full year plus one repeat month) — record more snapshots to unlock the pattern view."
					: "Seasonality needs several calendar months with repeat observations — the history so far has too many gaps or single observations per month.",
			method: [
				"Data: net worth snapshot history (user-scoped)",
				"method: month-over-month deltas grouped by calendar month",
			],
			findings: [
				{
					heading: "Findings",
					rows: [
						{ label: "snapshots recorded", value: String(history.length) },
						{ label: "consecutive monthly steps", value: String(result.steps) },
					],
				},
			],
		};
	}

	const worst = result.weakest;
	const best = result.strongest;

	return {
		slug: "net-worth-seasonality",
		title: "Net-Worth Seasonality",
		date,
		abstract: `Across ${result.steps} month-over-month steps, ${MONTHS[worst.monthOfYear]} is historically the weakest month (mean ${formatCurrency(worst.meanDeltaPence)}) and ${MONTHS[best.monthOfYear]} the strongest (mean ${formatCurrency(best.meanDeltaPence)}). Budget the calendar, not just the categories.`,
		method: [
			`Data: ${history.length} snapshots; ${result.steps} consecutive monthly steps (25–40d gaps only — longer gaps excluded)`,
			"mean net-worth delta per calendar month, at least two observations per month reported",
			"small histories make this noisy — treat single-month means as anecdotes, not laws",
		],
		findings: [
			{
				heading: "Mean monthly delta by calendar month",
				rows: result.months.map((m) => ({
					label: `${MONTHS[m.monthOfYear]} (n=${m.samples})`,
					value: formatCurrency(m.meanDeltaPence),
					flag: m.meanDeltaPence > 0 ? ("green" as const) : m.meanDeltaPence < 0 ? ("red" as const) : undefined,
				})),
			},
			{
				heading: "Extremes",
				rows: [
					// v3.1 A09: colour by SCALE not rank (the recorded sweep-9
					// rule) — a "strongest" month that still fell renders red,
					// not green
					{ label: `weakest ${MONTHS[worst.monthOfYear]}`, value: formatCurrency(worst.meanDeltaPence), flag: worst.meanDeltaPence > 0 ? ("green" as const) : worst.meanDeltaPence < 0 ? ("red" as const) : undefined },
					{ label: `strongest ${MONTHS[best.monthOfYear]}`, value: formatCurrency(best.meanDeltaPence), flag: best.meanDeltaPence > 0 ? ("green" as const) : best.meanDeltaPence < 0 ? ("red" as const) : undefined },
				],
				notes: [
					"Calendar effects often reflect routine rhythms: annual renewals, holiday spend, or bonus months — cross-check with the spending-profile report.",
				],
			},
		],
	};
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Spend concentration (v3.2 harvest, 2026-11-01): how much of each declared
 * month's spending lives in its biggest categories — Gini over category
 * spend, top-N share, and the effective number of categories (participation
 * ratio 1/Σp²). A concentrated month is budget-fragile: one category
 * decision moves the whole number. Math-paper structure per Appendix C
 * ("separate reports focussed on interesting ideas… math/science paper
 * format"); statement-honest — declared months only (D0).
 */
export function giniCoefficient(values: number[]): number {
	// zero-spend categories COUNT (a month where one category pays for
	// everything among four present categories is 0.75-concentrated, not
	// "equal among spenders") — matches the textbook [1,2,3,4]=0.25 check.
	// The monthly-spend source never passes zero rows, so this only bites
	// in direct calls/tests.
	const xs = [...values].sort((a, b) => a - b);
	const n = xs.length;
	if (n < 2) return 0;
	const total = xs.reduce((s, x) => s + x, 0);
	if (total <= 0) return 0;
	let weighted = 0;
	for (let i = 0; i < n; i++) weighted += (i + 1) * xs[i];
	return (2 * weighted) / (n * total) - (n + 1) / n;
}

/** concentration verdict scale (module-level for the regression test) */
export function concentrationFlag(gini: number): "green" | "amber" | "red" {
	if (gini < 0.5) return "green";
	if (gini <= 0.7) return "amber";
	return "red";
}

async function buildSpendConcentration(userId: number): Promise<ReportDoc> {
	const date = isoToday();
	const history = await getMonthlySpend(userId, 12);
	const declared = history.filter((m) => m.totalPence > 0);

	if (declared.length === 0) {
		return {
			slug: "spend-concentration",
			title: "Spend Concentration",
			date,
			abstract:
				"No categorised spend is declared for the last 12 months — import statements or tag transactions and the concentration math appears here.",
			method: [
				"Data: per-category monthly spend (budget-config aware, last 12 calendar months, declared months only)",
				"Gini over category spend; top-N cumulative share; effective categories = 1/Σp²",
			],
			findings: [{ heading: "Findings", rows: [{ label: "declared months", value: "0" }] }],
		};
	}

	const rowsFor = (month: (typeof declared)[number]) => {
		const shares = month.categories.map((c) => c.spentPence / month.totalPence);
		const gini = giniCoefficient(month.categories.map((c) => c.spentPence));
		const top1 = shares[0] ?? 0;
		const top3 = shares.slice(0, 3).reduce((s, p) => s + p, 0);
		const nEff = 1 / shares.reduce((s, p) => s + p * p, 0);
		return { month, gini, top1, top3, nEff };
	};

	const computed = declared.map(rowsFor); // chronological (source is oldest→newest)
	const latest = computed[computed.length - 1];
	const meanGini = computed.reduce((s, c) => s + c.gini, 0) / computed.length;
	const peak = computed.reduce((a, b) => (b.gini > a.gini ? b : a));
	const flat = computed.reduce((a, b) => (b.gini < a.gini ? b : a));

	return {
		slug: "spend-concentration",
		title: "Spend Concentration",
		date,
		abstract: `Across ${computed.length} declared month${computed.length !== 1 ? "s" : ""}, mean spend Gini is ${meanGini.toFixed(2)} — ${latest.month.month} sits at ${latest.gini.toFixed(2)} with the top 3 categories carrying ${(latest.top3 * 100).toFixed(0)}% of spend (${latest.nEff.toFixed(1)} effective categories). Concentrated months are budget-fragile: one category decision moves the whole number.`,
		method: [
			`Data: per-category monthly spend, ${computed.length} declared month${computed.length !== 1 ? "s" : ""} of the last 12 (statement model — undeclared months absent, not zero, D0)`,
			"Gini = 2·Σ(i·x_i)/(n·Σx) − (n+1)/n over category spend (0 = spread evenly, →1 = one category pays for everything)",
			"effective categories = 1/Σp² — the participation ratio: how many equal categories the month behaves like",
			"flags: green < 0.50 spread · amber 0.50–0.70 concentrated · red > 0.70 fragile",
		],
		findings: [
			{
				heading: `Latest declared month — ${latest.month.month}`,
				rows: [
					{ label: "spend Gini", value: latest.gini.toFixed(2), flag: concentrationFlag(latest.gini) },
					{ label: "top category", value: `${latest.month.categories[0]?.name ?? "—"} · ${formatCurrency(latest.month.categories[0]?.spentPence ?? 0)} (${(latest.top1 * 100).toFixed(0)}%)` },
					{ label: "top-3 share", value: `${(latest.top3 * 100).toFixed(0)}%`, flag: latest.top3 > 0.75 ? ("red" as const) : latest.top3 > 0.6 ? ("amber" as const) : ("green" as const) },
					{ label: "effective categories", value: `${latest.nEff.toFixed(1)} of ${latest.month.categories.length}` },
					{ label: "total declared spend", value: formatCurrency(latest.month.totalPence) },
				],
			},
			{
				heading: "Gini drift — declared months only",
				rows: [...computed]
					.reverse()
					.map((c) => ({
						label: c.month.month,
						value: `gini ${c.gini.toFixed(2)} · top-3 ${(c.top3 * 100).toFixed(0)}% · ${c.nEff.toFixed(1)} eff`,
						flag: concentrationFlag(c.gini),
					})),
				notes: [
					`gini, oldest → newest: ${asciiSparkline(computed.map((c) => c.gini))}`,
					`most concentrated: ${peak.month.month} (${peak.gini.toFixed(2)}) · most spread: ${flat.month.month} (${flat.gini.toFixed(2)})`,
				],
			},
		],
	};
}

// ---------------------------------------------------------------------------
// Statement cadence (v3.2 harvest, 2026-11-01) — which accounts narrate
// reliably. Companion to the statement-gap finder tool: where the tool
// lists interior holes, this report grades the whole declaration habit
// per account (coverage, silences, freshness) and the fleet's spread.
// D0: months exist only when a statement was declared (≥1 transaction).
// ---------------------------------------------------------------------------

export interface CadenceStats {
	firstMonth: string;
	lastMonth: string;
	/** months in first→last inclusive (endpoints declared by definition) */
	spanMonths: number;
	declaredCount: number;
	/** declared ÷ span, 0–1 */
	coveragePct: number;
	/** interior months with zero transactions (before-first never counts) */
	gapCount: number;
	/** longest run of consecutive interior missing months */
	longestGapRun: number;
}

/**
 * Pure cadence math over one account's declared months (YYYY-MM keys,
 * any order). Returns null when nothing is declared — the account is
 * not a narrator yet, not a failing one (D0).
 */
export function statementCadence(declaredMonths: string[]): CadenceStats | null {
	const declared = [...new Set(declaredMonths.filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort();
	if (declared.length === 0) return null;
	const firstMonth = declared[0];
	const lastMonth = declared[declared.length - 1];
	const set = new Set(declared);
	let spanMonths = 0;
	const missing: string[] = [];
	let longestGapRun = 0;
	let run = 0;
	{
		const [fy, fm] = firstMonth.split("-").map(Number);
		const [ly, lm] = lastMonth.split("-").map(Number);
		let y = fy;
		let m = fm;
		while (y < ly || (y === ly && m <= lm)) {
			const key = `${y}-${String(m).padStart(2, "0")}`;
			spanMonths++;
			if (!set.has(key) && key !== lastMonth) {
				missing.push(key);
				run++;
				longestGapRun = Math.max(longestGapRun, run);
			} else {
				run = 0;
			}
			m++;
			if (m > 12) {
				m = 1;
				y++;
			}
		}
	}
	return {
		firstMonth,
		lastMonth,
		spanMonths,
		declaredCount: declared.length,
		coveragePct: spanMonths > 0 ? declared.length / spanMonths : 1,
		gapCount: missing.length,
		longestGapRun,
	};
}

/** coverage flag scale: green ≥0.90 complete · amber ≥0.70 patchy · red below */
export function cadenceFlag(coveragePct: number): "green" | "amber" | "red" {
	if (coveragePct >= 0.9) return "green";
	if (coveragePct >= 0.7) return "amber";
	return "red";
}

/** lag flag scale: green 0 · amber 1 · red ≥2 months behind the fleet */
export function lagFlag(lag: number): "green" | "amber" | "red" {
	if (lag <= 0) return "green";
	if (lag === 1) return "amber";
	return "red";
}

/** severity rank for worst-of flagging (green < amber < red) */
const FLAG_RANK: Record<"green" | "amber" | "red", number> = { green: 0, amber: 1, red: 2 };

/** the row carries the worse of coverage and freshness — both promised by the legend */
export function cadenceRowFlag(coveragePct: number, lag: number): "green" | "amber" | "red" {
	const byCoverage = cadenceFlag(coveragePct);
	const byLag = lagFlag(lag);
	return FLAG_RANK[byCoverage] >= FLAG_RANK[byLag] ? byCoverage : byLag;
}

/** months an account sits behind the fleet's freshest declaration */
export function cadenceLagMonths(accountLast: string, fleetLast: string): number {
	if (!/^\d{4}-\d{2}$/.test(accountLast) || !/^\d{4}-\d{2}$/.test(fleetLast)) return 0;
	const [ay, am] = accountLast.split("-").map(Number);
	const [fy, fm] = fleetLast.split("-").map(Number);
	return (fy - ay) * 12 + (fm - am);
}

async function buildStatementCadence(userId: number): Promise<ReportDoc> {
	const date = isoToday();
	// month keys are bucketed in JS: strftime on this timestamp column returns
	// NULL (verified live, documented in budgets.ts 2026-10-28) — sqlite reads
	// bare unix-second integers as Julian days. Select DISTINCT dates only.
	const rows = await db
		.selectDistinct({
			slug: accounts.slug,
			name: accounts.name,
			transactionDate: accountTransactions.transactionDate,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accounts.id, accountTransactions.accountId))
		.where(withUserFilter(userId, accounts));

	// reduce to per-account declared-month sets
	const byAccount = new Map<string, { name: string; months: Set<string> }>();
	for (const r of rows) {
		const d = new Date(r.transactionDate);
		if (Number.isNaN(d.getTime())) continue;
		const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
		let entry = byAccount.get(r.slug);
		if (!entry) {
			entry = { name: r.name, months: new Set<string>() };
			byAccount.set(r.slug, entry);
		}
		entry.months.add(key);
	}

	const perAccount = [...byAccount.entries()]
		.map(([slug, { name, months }]) => {
			const stats = statementCadence([...months]);
			return stats ? { slug, name, stats, monthSet: months } : null;
		})
		.filter((a): a is NonNullable<typeof a> => a !== null);
	if (perAccount.length === 0) {
		return {
			slug: "statement-cadence",
			title: "Statement Cadence",
			date,
			abstract:
				"No declared statement months on record — import statements (Settings → Data) and the cadence math appears here.",
			method: [
				"Data: per-account transaction months (a month exists when it carries ≥1 transaction, D0 statement model)",
				"coverage = declared months ÷ months inside each account's first→last span (endpoints declared by definition)",
				"gaps = interior months with zero transactions; before-first never counts (the account may not have existed)",
				"lag = months between an account's last declaration and the fleet's freshest",
			],
			findings: [{ heading: "Findings", rows: [{ label: "accounts with declarations", value: "0" }] }],
		};
	}
	const fleetLast = perAccount.reduce(
		(a, b) => (b.stats.lastMonth > a ? b.stats.lastMonth : a),
		perAccount[0].stats.lastMonth,
	);
	const lagging = perAccount.map((a) => ({ ...a, lag: cadenceLagMonths(a.stats.lastMonth, fleetLast) }));
	lagging.sort((a, b) => a.stats.coveragePct - b.stats.coveragePct || b.lag - a.lag);
	const meanCoverage = lagging.reduce((s, a) => s + a.stats.coveragePct, 0) / lagging.length;
	const silentMonthsTotal = lagging.reduce((s, a) => s + a.stats.gapCount, 0);
	const stalest = lagging[0];
	const atFreshest = lagging.filter((a) => a.lag === 0).length;
	// D0 honesty: accounts that exist but never declared are part of the story
	const totalAccounts = await db
		.select({ slug: accounts.slug })
		.from(accounts)
		.where(withUserFilter(userId, accounts));
	const silentAccounts = totalAccounts.length - lagging.length;
	const widest = lagging.reduce((a, b) => (b.stats.spanMonths > a.stats.spanMonths ? b : a));
	const deepest = lagging.reduce((a, b) => (b.stats.longestGapRun > a.stats.longestGapRun ? b : a));

	// coverage strip (last ≤24 months of the span): █ declared · · silent
	const stripFor = (a: (typeof lagging)[number]): string => {
		const [fy, fm] = a.stats.firstMonth.split("-").map(Number);
		const [ly, lm] = a.stats.lastMonth.split("-").map(Number);
		const total = (ly - fy) * 12 + (lm - fm) + 1;
		const skip = Math.max(0, total - 24);
		let y = fy;
		let m = fm;
		let i = 0;
		let out = "";
		while (y < ly || (y === ly && m <= lm)) {
			const key = `${y}-${String(m).padStart(2, "0")}`;
			if (i >= skip) out += a.monthSet.has(key) || key === a.stats.lastMonth ? "█" : "·";
			i++;
			m++;
			if (m > 12) {
				m = 1;
				y++;
			}
		}
		return skip > 0 ? `…${out}` : out;
	};

	return {
		slug: "statement-cadence",
		title: "Statement Cadence",
		date,
		abstract: `Across ${lagging.length} account${lagging.length !== 1 ? "s" : ""} with declarations, the freshest month is ${fleetLast} and mean interior coverage is ${(meanCoverage * 100).toFixed(0)}% — ${silentMonthsTotal} silent month${silentMonthsTotal !== 1 ? "s" : ""} hide inside declared ranges. ${atFreshest} of ${lagging.length} account${lagging.length !== 1 ? "s" : ""} declared through ${fleetLast}; the thinnest narrator is ${stalest.name} at ${(stalest.stats.coveragePct * 100).toFixed(0)}% coverage.`,
		method: [
			`Data: per-account transaction months, ${lagging.length} account${lagging.length !== 1 ? "s" : ""} carrying ≥1 declaration (D0: undeclared months are absent, not zero)`,
			"coverage = declared ÷ months inside the account's first→last span; endpoints are declared by definition",
			"gaps = interior months with zero transactions (same rule as the statement-gap finder tool); longest run = max consecutive silence",
			"lag = months behind the fleet's freshest declaration — staleness against your own best habit, not against realtime",
			"flags: green ≥90% · amber 70–89% · red <70% (lag: green 0 · amber 1 · red ≥2)",
		],
		findings: [
			{
				heading: "Fleet",
				figure: "none",
				rows: [
					{ label: "accounts with declarations", value: `${lagging.length} of ${totalAccounts.length}` },
					{ label: "freshest declared month", value: fleetLast },
					{ label: "accounts at freshest", value: `${atFreshest} of ${lagging.length}`, flag: atFreshest === lagging.length ? ("green" as const) : atFreshest * 2 >= lagging.length ? ("amber" as const) : ("red" as const) },
					{ label: "mean coverage", value: `${(meanCoverage * 100).toFixed(0)}%`, flag: cadenceFlag(meanCoverage) },
					{ label: "total silent interior months", value: `${silentMonthsTotal}`, flag: silentMonthsTotal === 0 ? ("green" as const) : null },
					{ label: "widest span", value: `${widest.name} · ${widest.stats.spanMonths} months (${widest.stats.firstMonth}→${widest.stats.lastMonth})` },
					{ label: "longest single silence", value: deepest.stats.longestGapRun === 0 ? "none — every narrator unbroken" : `${deepest.name} · ${deepest.stats.longestGapRun} months`, flag: deepest.stats.longestGapRun >= 3 ? ("red" as const) : deepest.stats.longestGapRun >= 2 ? ("amber" as const) : null },
					{ label: "accounts with zero declarations", value: `${silentAccounts}`, flag: silentAccounts === 0 ? ("green" as const) : ("amber" as const) },
				],
			},
			{
				heading: "Per-account cadence — thinnest first",
				figure: "none",
				rows: lagging.map((a) => ({
					label: a.name,
					value: `${a.stats.firstMonth}→${a.stats.lastMonth} · coverage ${(a.stats.coveragePct * 100).toFixed(0)}% · ${a.stats.gapCount} gap${a.stats.gapCount !== 1 ? "s" : ""} (longest ${a.stats.longestGapRun}) · lag ${a.lag}mo`,
					flag: cadenceRowFlag(a.stats.coveragePct, a.lag),
				})),
				notes: [
					...lagging.slice(0, 12).map((a) => `${stripFor(a)}  ${a.name} (${(a.stats.coveragePct * 100).toFixed(0)}%)`),
					"strip = last ≤24 months of each account's declared span · █ declared · silent interior = ·",
				],
			},
		],
	};
}
// ---------------------------------------------------------------------------
// Bill chronology (v3.2 harvest, 2026-11-01) — the bill-history report the
// 2026-10-18 ask pointed at ("new behavior for all of our bills and bill
// history"). The /overview/bills detector is deliberately monthly-only;
// this report classifies EVERY recurring outgoing's cadence (monthly /
// quarterly / annual / irregular) and grades amount drift + jitter.
// D0: evidence is declared statements only — a "skipped" month may simply
// be an undeclared statement; drift/jitter are computed over what exists.
// ---------------------------------------------------------------------------

export type BillCadence = "monthly" | "quarterly" | "annual" | "irregular";

export interface BillCadenceStats {
	cadence: BillCadence;
	occurrences: number;
	medianGapDays: number;
	/** max−min of the observed gaps; small = metronomic */
	jitterDays: number;
	firstDate: string;
	lastDate: string;
}

/** day gaps between sorted dates */
export function dayGaps(dates: Date[]): number[] {
	const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
	const gaps: number[] = [];
	for (let i = 1; i < sorted.length; i++) {
		gaps.push(Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000));
	}
	return gaps;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Pure cadence classification over one description-group's payment dates.
 * Class windows are generous on purpose (real bills drift across weekends
 * and statement cut-offs). Too few payments to classify → irregular.
 */
export function classifyBillCadence(dates: Date[]): BillCadenceStats | null {
	if (dates.length < 2) return null;
	const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
	const gaps = dayGaps(sorted);
	const med = median(gaps);
	const jitter = gaps.length > 0 ? Math.max(...gaps) - Math.min(...gaps) : 0;
	const inWindow = (lo: number, hi: number) => gaps.every((g) => g >= lo && g <= hi);
	// annual needs just 2 payments (sparse by nature); others need 3+
	let cadence: BillCadence = "irregular";
	if (dates.length >= 3 && inWindow(21, 42)) cadence = "monthly";
	else if (dates.length >= 3 && inWindow(72, 115)) cadence = "quarterly";
	else if (dates.length >= 2 && inWindow(330, 400)) cadence = "annual";
	return {
		cadence,
		occurrences: dates.length,
		medianGapDays: med,
		jitterDays: jitter,
		firstDate: sorted[0].toISOString().slice(0, 10),
		lastDate: sorted[sorted.length - 1].toISOString().slice(0, 10),
	};
}

/** amount drift: (max−min)/median of the observed amounts, 0–1+ */
export function amountDriftPct(amounts: number[]): number {
	if (amounts.length === 0) return 0;
	const med = median(amounts.map(Math.abs));
	if (med <= 0) return 0;
	const max = Math.max(...amounts.map(Math.abs));
	const min = Math.min(...amounts.map(Math.abs));
	return (max - min) / med;
}

/** drift flag: green ≤10% stable · amber ≤25% creeping · red >25% reprice */
export function driftFlag(driftPct: number): "green" | "amber" | "red" {
	if (driftPct <= 0.1) return "green";
	if (driftPct <= 0.25) return "amber";
	return "red";
}

async function buildBillChronology(userId: number): Promise<ReportDoc> {
	const date = isoToday();
	const txRows = await db
		.select({
			slug: accountTransactions.slug,
			description: accountTransactions.description,
			amount: accountTransactions.amount,
			transactionDate: accountTransactions.transactionDate,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accounts.id, accountTransactions.accountId))
		.where(
			and(
				withUserFilter(userId, accounts),
				isNull(accounts.deletedAt),
				eq(accountTransactions.type, "withdrawal"),
			),
		);
	// descriptions are encrypted at rest — decrypt BEFORE grouping
	const groups = new Map<string, { dates: Date[]; amounts: number[] }>();
	for (const t of txRows) {
		const description = decryptTxDescription(userId, t.slug, t.description);
		if (!description || description.trim().length <= 3) continue;
		const key = description.toLowerCase().trim();
		const group = groups.get(key) ?? { dates: [], amounts: [] };
		group.dates.push(new Date(t.transactionDate));
		group.amounts.push(Number(t.amount));
		groups.set(key, group);
	}

	interface Bill {
		name: string;
		stats: BillCadenceStats;
		medianAmountPence: number;
		driftPct: number;
		lifetimePence: number;
		monthlyEquivalentPence: number;
		paidMonths: Set<string>;
		spanKey: string;
	}
	const bills: Bill[] = [];
	for (const [key, g] of groups) {
		const stats = classifyBillCadence(g.dates);
		if (!stats || stats.cadence === "irregular") continue;
		const amountsAbs = g.amounts.map((a) => Math.abs(a));
		const med = Math.round(median(amountsAbs));
		const lifetime = Math.round(amountsAbs.reduce((s, a) => s + a, 0));
		bills.push({
			name: key,
			stats,
			medianAmountPence: med,
			driftPct: amountDriftPct(g.amounts),
			lifetimePence: lifetime,
			monthlyEquivalentPence: Math.round((lifetime / stats.occurrences) * (365.25 / 12 / stats.medianGapDays)),
			paidMonths: new Set(g.dates.map((d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`)),
			spanKey: `${stats.firstDate.slice(0, 7)}→${stats.lastDate.slice(0, 7)}`,
		});
	}
	bills.sort((a, b) => b.lifetimePence - a.lifetimePence);

	if (bills.length === 0) {
		return {
			slug: "bill-chronology",
			title: "Bill Chronology",
			date,
			abstract:
				"No recurring withdrawals on record — import statements and every regular outgoing lands here with its cadence, drift, and lifetime cost.",
			method: [
				"Data: declared withdrawals grouped by decrypted description (≥3 payments, ≥2 for annual)",
				"cadence windows: monthly 21–42d · quarterly 72–115d · annual 330–400d (every gap in window) — else irregular and excluded",
				"drift = (max−min) ÷ median amount; jitter = max−min gap in days",
				"monthly-equivalent = lifetime ÷ occurrences × (30.44 ÷ median gap) — cadences made comparable",
			],
			findings: [{ heading: "Findings", rows: [{ label: "recurring outgoings", value: "0" }] }],
		};
	}

	const byCadence = (c: BillCadence) => bills.filter((b) => b.stats.cadence === c);
	const monthlyEq = bills.reduce((s, b) => s + b.monthlyEquivalentPence, 0);
	const nonMonthly = bills.filter((b) => b.stats.cadence !== "monthly");
	const creeping = [...bills].sort((a, b) => b.driftPct - a.driftPct)[0];
	const metronomic = [...bills].sort((a, b) => a.stats.jitterDays - b.stats.jitterDays)[0];
	const lifetimeTotal = bills.reduce((s, b) => s + b.lifetimePence, 0);
	// D0 honesty in the kicker: 0% drift is NOT creep — when nothing has
	// moved, say so instead of naming a "steepest" climber at zero
	// (vision-caught contradiction 2026-11-01)
	const creepKicker =
		creeping.driftPct > 0.005
			? `Steepest price creep: ${creeping.name} at ${(creeping.driftPct * 100).toFixed(0)}% drift.`
			: "No bill has changed price across its whole recorded history.";

	return {
		slug: "bill-chronology",
		title: "Bill Chronology",
		date,
		abstract: `${bills.length} recurring outgoing${bills.length !== 1 ? "s" : ""} on record, lifetime ${formatCurrency(lifetimeTotal)} — ${formatCurrency(monthlyEq)}/month equivalent across monthly, quarterly, and annual cadences. ${nonMonthly.length} bill${nonMonthly.length !== 1 ? "s" : ""} sit outside the monthly detector's window and are invisible on /overview/bills. ${creepKicker}`,
		method: [
			`Data: declared withdrawals grouped by description, ${bills.length} group${bills.length !== 1 ? "s" : ""} passing a cadence window (D0: undeclared statement months are absent, not skipped)`,
			"cadence windows: monthly 21–42d · quarterly 72–115d · annual 330–400d — every gap inside the window, else irregular (excluded)",
			"drift = (max−min) ÷ median amount · jitter = max−min observed gap (days)",
			"monthly-equivalent = lifetime ÷ occurrences × (30.44 ÷ median gap) — a £90/quarter bill reads as £30/mo",
			"flags: drift green ≤10% · amber ≤25% · red >25%",
		],
		findings: [
			{
				heading: "By cadence",
				figure: "none",
				rows: [
					...(["monthly", "quarterly", "annual"] as BillCadence[]).map((c) => {
						const list = byCadence(c);
						return {
							label: c,
							// D5: neutral values — a cadence class is a fact, not a status
							value: `${list.length} bill${list.length !== 1 ? "s" : ""} · ${formatCurrency(list.reduce((s, b) => s + b.monthlyEquivalentPence, 0))}/mo eq`,
						};
					}),
					{
						label: "total (monthly-equivalent)",
						value: `${formatCurrency(monthlyEq)}/mo · lifetime ${formatCurrency(lifetimeTotal)}`,
					},
				],
				notes: nonMonthly.length > 0
					? [`${nonMonthly.length} non-monthly bill${nonMonthly.length !== 1 ? "s" : ""} below do NOT appear on /overview/bills — its detector is monthly-only by design (28–35d); this report is their ledger.`]
					: ["every recurring bill is monthly — /overview/bills already sees the whole set."],
			},
			{
				heading: "Per-bill chronology — largest lifetime first",
				figure: "none",
				rows: bills.map((b) => ({
					label: b.name,
					value: `${b.stats.cadence} · ${b.stats.occurrences}× · gap ${b.stats.medianGapDays}d ±${b.stats.jitterDays} · ${formatCurrency(b.medianAmountPence)} median (drift ${(b.driftPct * 100).toFixed(0)}%) · lifetime ${formatCurrency(b.lifetimePence)}`,
					flag: driftFlag(b.driftPct),
				})),
				notes: [
					...bills.slice(0, 12).map((b) => {
						// month strip over the bill's own span: █ paid · nothing due = −
						const [fy, fm] = b.stats.firstDate.slice(0, 7).split("-").map(Number);
						const [ly, lm] = b.stats.lastDate.slice(0, 7).split("-").map(Number);
						let y = fy;
						let m = fm;
						let strip = "";
						let guard = 0;
						while ((y < ly || (y === ly && m <= lm)) && guard < 36) {
							const key = `${y}-${String(m).padStart(2, "0")}`;
							strip += b.paidMonths.has(key) ? "█" : "−";
							m++;
							if (m > 12) { m = 1; y++; }
							guard++;
						}
						return `${strip}  ${b.name} (${b.spanKey})`;
					}),
					"strip = months of the bill's own span · █ paid · − no matching payment (may be an undeclared statement — D0)",
					`most metronomic: ${metronomic.name} (±${metronomic.stats.jitterDays}d) · ${creeping.driftPct > 0.005 ? `steepest creep: ${creeping.name} (${(creeping.driftPct * 100).toFixed(0)}%)` : "no price movement on record"}`,
				],
			},
		],
	};
}
// ---------------------------------------------------------------------------
// Goal velocity (v3.2 harvest, 2026-11-01) — funding rate vs deadline
// pressure across every goal. The goals page shows state; this report shows
// PACE: trailing-6-month funding rate against the £/month each deadline
// demands, ETAs at current rate, and the goals that cannot make it.
// D0: rates are declared-history averages (allocation events are user-entered
// records, not realtime balances); projections say "at the current rate".
// ---------------------------------------------------------------------------

export interface GoalVelocityStats {
	/** £/mo from the trailing 6 months of allocations (0 when silent) */
	ratePencePerMonth: number;
	/** £/mo the deadline demands (0 when no deadline) */
	requiredPencePerMonth: number;
	/** months to target at the current rate (null when rate ≤ 0) */
	monthsToTarget: number | null;
	/** months left until targetDate (null when no deadline) */
	monthsLeft: number | null;
	verdict: "on-track" | "short-pace" | "wont-finish" | "no-deadline" | "funded" | "stalled";
}

export function goalVelocity(
	currentPence: number,
	targetPence: number,
	allocationEvents: Array<{ amount: number; date: Date }>,
	now: Date,
	targetDate: Date | null,
): GoalVelocityStats {
	const remaining = targetPence - currentPence;
	if (remaining <= 0) {
		return { ratePencePerMonth: 0, requiredPencePerMonth: 0, monthsToTarget: 0, monthsLeft: null, verdict: "funded" };
	}
	const sixMonthsAgo = new Date(now.getTime() - 183 * 86_400_000);
	const trailing = allocationEvents.filter((e) => e.date >= sixMonthsAgo && e.date <= now);
	const rate = Math.round(trailing.reduce((s, e) => s + e.amount, 0) / 6);
	const monthsLeft = targetDate
		? Math.max(0, Math.round(((targetDate.getTime() - now.getTime()) / 86_400_000) / 30.44))
		: null;
	const monthsToTarget = rate > 0 ? Math.ceil(remaining / rate) : null;
	const required = monthsLeft !== null && monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : 0;
	// NOTE: ETA ≤ monthsLeft ⟺ rate ≥ required — a single threshold. The
	// old "behind" branch (<60% of required AND fitting the deadline) was
	// unreachable dead code; the honest split is severity of the shortfall.
	let verdict: GoalVelocityStats["verdict"];
	if (rate <= 0) verdict = "stalled";
	else if (monthsLeft === null) verdict = "no-deadline";
	else if (required <= 0 || rate >= required) verdict = "on-track";
	else if (rate >= required * 0.6) verdict = "short-pace";
	else verdict = "wont-finish";
	return { ratePencePerMonth: rate, requiredPencePerMonth: required, monthsToTarget, monthsLeft, verdict };
}

export function velocityFlag(verdict: GoalVelocityStats["verdict"]): "green" | "amber" | "red" | null {
	switch (verdict) {
		case "on-track":
		case "funded":
			return "green";
		case "short-pace":
		case "no-deadline":
		case "stalled":
			return "amber";
		case "wont-finish":
			return "red";
	}
}

async function buildGoalVelocity(userId: number): Promise<ReportDoc> {
	const date = isoToday();
	const goalRows = await db
		.select({
			slug: goals.slug,
			name: goals.name,
			targetAmountInCents: goals.targetAmountInCents,
			targetDate: goals.targetDate,
		})
		.from(goals)
		.where(and(withUserFilter(userId, goals), isNull(goals.deletedAt)));
	const allocRows = goalRows.length
		? await db
				.select({
					goalId: goalAllocations.goalId,
					amount: goalAllocations.amount,
					allocationDate: goalAllocations.allocationDate,
				})
				.from(goalAllocations)
				.innerJoin(goals, eq(goals.id, goalAllocations.goalId))
				.where(and(withUserFilter(userId, goals), isNull(goals.deletedAt)))
		: [];

	interface GoalRow {
		slug: string;
		name: string;
		currentPence: number;
		targetPence: number;
		stats: GoalVelocityStats;
		monthlyAdds: number[];
	}
	const byGoal = new Map<number, { current: number; events: Array<{ amount: number; date: Date }> }>();
	for (const a of allocRows) {
		const entry = byGoal.get(a.goalId) ?? { current: 0, events: [] };
		entry.current += Number(a.amount);
		entry.events.push({ amount: Number(a.amount), date: new Date(a.allocationDate) });
		byGoal.set(a.goalId, entry);
	}
	void byGoal;

	const now = new Date();
	const goalIds = await db
		.select({ id: goals.id, slug: goals.slug })
		.from(goals)
		.where(and(withUserFilter(userId, goals), isNull(goals.deletedAt)));
	const idBySlug = new Map(goalIds.map((g) => [g.slug, g.id]));

	const rows: GoalRow[] = goalRows.map((g) => {
		const sum = byGoal.get(idBySlug.get(g.slug) ?? -1) ?? { current: 0, events: [] };
		const monthlyAdds = new Array<number>(12).fill(0);
		for (const e of sum.events) {
			const monthsAgo = Math.floor((now.getTime() - e.date.getTime()) / (30.44 * 86_400_000));
			if (monthsAgo >= 0 && monthsAgo < 12 && e.amount > 0) monthlyAdds[11 - monthsAgo] += e.amount;
		}
		return {
			slug: g.slug,
			name: g.name,
			currentPence: Math.round(sum.current),
			targetPence: g.targetAmountInCents,
			stats: goalVelocity(sum.current, g.targetAmountInCents, sum.events, now, g.targetDate ? new Date(g.targetDate) : null),
			monthlyAdds,
		};
	});
	const VERDICT_RANK: Record<GoalVelocityStats["verdict"], number> = {
		"wont-finish": 0,
		stalled: 1,
		"short-pace": 2,
		"no-deadline": 3,
		"on-track": 4,
		funded: 5,
	};
	rows.sort((a, b) => {
		const ka = VERDICT_RANK[a.stats.verdict];
		const kb = VERDICT_RANK[b.stats.verdict];
		return ka - kb || b.targetPence - b.currentPence - (a.targetPence - a.currentPence);
	});

	if (rows.length === 0) {
		return {
			slug: "goal-velocity",
			title: "Goal Velocity",
			date,
			abstract: "No goals on record — create goals and fund them, and the pace math appears here.",
			method: [
				"Data: goals (target, deadline) + the signed allocation ledger (every add/withdraw event)",
				"rate = trailing 6 months of allocations ÷ 6 (declared-history average, D0 — not realtime)",
				"required = remaining ÷ months to deadline · ETA = remaining ÷ rate (ceil)",
				"verdicts: on-track (rate ≥ required) · short-pace (60–99% — catchable) · wont-finish (<60% of required) · stalled (rate 0) · funded",
			],
			findings: [{ heading: "Findings", rows: [{ label: "goals", value: "0" }] }],
		};
	}

	const deadlineGoals = rows.filter((r) => r.stats.monthsLeft !== null && r.stats.verdict !== "funded");
	const wontFinish = rows.filter((r) => r.stats.verdict === "wont-finish");
	const onTrack = rows.filter((r) => r.stats.verdict === "on-track");
	const totalRemaining = rows.reduce((s, r) => s + Math.max(0, r.targetPence - r.currentPence), 0);
	const fleetRate = rows.reduce((s, r) => s + r.stats.ratePencePerMonth, 0);

	return {
		slug: "goal-velocity",
		title: "Goal Velocity",
		date,
		abstract: `${rows.length} goals hold ${formatCurrency(totalRemaining)} of combined headroom. ${deadlineGoals.length} carry deadlines — ${onTrack.length} on pace, ${wontFinish.length} cannot finish at their current rate. Fleet funding runs ${formatCurrency(fleetRate)}/month (trailing 6m average); every ETA below is that average projected, not a promise.`,
		method: [
			"Data: goals + the signed allocation ledger (adds and withdrawals, user-entered records — D0: declared history, not realtime)",
			"rate = trailing-6-month allocations ÷ 6 · required = remaining ÷ months-to-deadline · ETA = remaining ÷ rate",
			"verdicts: on-track (rate ≥ required) · short-pace (60–99% of required — a push catches it) · wont-finish (<60%) · stalled (rate 0) · no-deadline (pace-only) · funded",
			"label % = funded share (current balance ÷ target)",
			"flags: green on-track/funded · amber short-pace/stalled/no-deadline · red wont-finish",
		],
		findings: [
			{
				heading: "Fleet",
				figure: "none",
				rows: [
					{ label: "goals", value: `${rows.length}` },
					{ label: "with deadlines", value: `${deadlineGoals.length}`, flag: deadlineGoals.length === 0 ? null : wontFinish.length === 0 ? ("green" as const) : ("amber" as const) },
					{ label: "cannot finish at current rate", value: `${wontFinish.length}`, flag: wontFinish.length === 0 ? ("green" as const) : ("red" as const) },
					{ label: "combined headroom", value: formatCurrency(totalRemaining) },
					{ label: "fleet funding rate", value: `${formatCurrency(fleetRate)}/mo (6m avg)` },
				],
			},
			{
				heading: "Per-goal pace — worst first",
				figure: "none",
				rows: rows.map((r) => {
					const pct = r.targetPence > 0 ? Math.min(100, Math.round((r.currentPence / r.targetPence) * 100)) : 100;
					const eta = r.stats.monthsToTarget === null ? "never (stalled)" : r.stats.monthsToTarget === 0 ? "funded" : `${r.stats.monthsToTarget}mo`;
					const need = r.stats.requiredPencePerMonth > 0 ? `needs ${formatCurrency(r.stats.requiredPencePerMonth)}/mo` : r.stats.monthsLeft !== null ? "deadline too close" : "no deadline";
					return {
						label: `${r.name} (${pct}%)`,
						value: `${formatCurrency(r.stats.ratePencePerMonth)}/mo vs ${need} · ETA ${eta}${r.stats.monthsLeft !== null ? ` in ${r.stats.monthsLeft}mo` : ""} · ${r.stats.verdict}`,
						flag: velocityFlag(r.stats.verdict),
					};
				}),
				notes: [
					...rows.slice(0, 12).map((r) => `${asciiSparkline(r.monthlyAdds)}  ${r.name} (${formatCurrency(r.monthlyAdds.reduce((s, v) => s + v, 0))} added, 12mo)`),
					"sparkline = £ added per month, oldest → newest (12 months)",
				],
			},
		],
	};
}


export const REPORTS: ReportDefinition[] = [
	{
		slug: "net-worth-trajectory",
		title: "Net Worth Trajectory",
		blurb: "Where the number has been, and the size of every step.",
		build: buildNetWorth,
	},
	{
		slug: "savings-rate",
		title: "Savings Rate & Runway",
		blurb: "What fraction of income survives each declared month.",
		build: buildSavingsRate,
	},
	{
		slug: "interest-vs-allowance",
		title: "Interest vs the Personal Savings Allowance",
		blurb: "Is the taxman getting a cut of the interest this tax year?",
		build: buildInterest,
	},
	{
		slug: "credit-strategy",
		title: "Credit Strategy — Stoozing & Payoff Pressure",
		blurb: "0% deadlines, split-tracker progress, and the cost of being late.",
		build: buildCreditStrategy,
	},
	{
		slug: "spending-profile",
		title: "Spending Profile — Where the Money Goes",
		blurb: "Category concentration and the shape of six months of spending.",
		build: buildSpendingProfile,
	},
	{
		slug: "debt-horizon",
		title: "Debt Horizon",
		blurb: "How far the minimum payments stretch, and the projected debt-free date.",
		build: buildDebtHorizon,
	},
	{
		slug: "income-vs-deposits",
		title: "Income vs Deposit Evidence",
		blurb: "Does the declared income actually land in the accounts? The derived payslip review.",
		build: buildIncomeVsDeposits,
	},
	{
		slug: "rate-shop",
		title: "Rate Shop — Your Own Best Rates",
		blurb: "Deposits earning below your own best same-wrapper rate, and what moving them adds.",
		build: buildRateShop,
	},
	{
		slug: "net-worth-seasonality",
		title: "Net-Worth Seasonality",
		blurb: "Which calendar months historically shrink the number, and which grow it.",
		build: buildSeasonality,
	},
	{
		slug: "spend-concentration",
		title: "Spend Concentration",
		blurb: "Does one category carry the month, or is the load spread?",
		build: buildSpendConcentration,
	},
	{
		slug: "statement-cadence",
		title: "Statement Cadence",
		blurb: "Which accounts narrate reliably — coverage, silences, and freshness of declarations.",
		build: buildStatementCadence,
	},
	{
		slug: "bill-chronology",
		title: "Bill Chronology",
		blurb: "Every recurring outgoing's cadence, price creep, and lifetime cost — quarterly and annual included.",
		build: buildBillChronology,
	},
	{
		slug: "goal-velocity",
		title: "Goal Velocity",
		blurb: "Funding pace against deadline pressure — which goals make it and which cannot.",
		build: buildGoalVelocity,
	},
];

export function findReport(slug: string): ReportDefinition | undefined {
	return REPORTS.find((report) => report.slug === slug);
}
