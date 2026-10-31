import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	expensesHistory,
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

	const monthsOfMinimums =
		debt.totalMonthlyMinimumInCents > 0
			? Math.ceil(debt.totalDebtInCents / debt.totalMonthlyMinimumInCents)
			: null;

	return {
		slug: "debt-horizon",
		title: "Debt Horizon",
		date,
		abstract: `${formatCurrency(debt.totalDebtInCents)} of debt across ${debt.goals.length} tracked goal${debt.goals.length !== 1 ? "s" : ""}, with minimum payments of ${formatCurrency(debt.totalMonthlyMinimumInCents)}/mo${monthsOfMinimums ? ` — ${monthsOfMinimums} months of minimums to clear` : ""}. ${debt.projectedDebtFreeDate ? `Projected debt-free: ${debt.projectedDebtFreeDate.toISOString().slice(0, 10)}.` : "No projection until payment schedules are set."}`,
		method: [
			"Data: debt goals with linked accounts (balances, minimum payment rules)",
			"Waterfall order: smallest balance first (snowball)",
			"projection = minimum-payment schedule unless a strategy overrides it",
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
					...(monthsOfMinimums
						? [{ label: "months at minimums", value: String(monthsOfMinimums), flag: "amber" as const }]
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
];

export function findReport(slug: string): ReportDefinition | undefined {
	return REPORTS.find((report) => report.slug === slug);
}
