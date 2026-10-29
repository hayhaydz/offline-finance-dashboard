/** Tool registry (v3 B08, R13): every tool's slug, name and one-liner. */

export interface ToolMeta {
	slug: string;
	name: string;
	blurb: string;
}

export const TOOLS: ToolMeta[] = [
	{
		slug: "rate-what-if",
		name: "Rate-change what-if",
		blurb: "Drag per-account rates ±2% and watch taxable interest and PSA tax move.",
	},
	{
		slug: "overpayment",
		name: "Overpayment simulator",
		blurb: "What an extra £10–£500/mo does to each debt's payoff date and interest.",
	},
	{
		slug: "isa-optimiser",
		name: "ISA optimiser",
		blurb: "How much tax a taxable→ISA move of £X saves this tax year.",
	},
	{
		slug: "compound",
		name: "Savings compound projector",
		blurb: "Start + monthly contributions at a rate, compounded monthly over years.",
	},
	{
		slug: "stooze",
		name: "Stooze calculator",
		blurb: "Interest earned riding a 0% promo vs the cost of missing its end date.",
	},
	{
		slug: "fi-projector",
		name: "Milestone projector",
		blurb: "When the next £10k…£1M net-worth crossings happen at the current slope.",
	},
];

export function findTool(slug: string): ToolMeta | undefined {
	return TOOLS.find((tool) => tool.slug === slug);
}
