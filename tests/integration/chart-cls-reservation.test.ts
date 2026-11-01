import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { ComponentProps } from "svelte";
import AllocationBar from "$lib/components/charts/AllocationBar.svelte";
import HistoryTrendChart from "$lib/components/HistoryTrendChart.svelte";

// V1 (2026-11-01, a15-open-ux): client-only chart mounts MUST reserve their
// exact final height in the SSR payload. Before this fix the panel grew at
// hydration and shoved every element below it down mid-click — the user's
// "clicking the links just scrolls the page, clicking again opens it" bug on
// accounts/goals (pointer lands on a different card; click fires on the
// grid, not the link). These tests pin the height reservation so the class
// cannot silently regress.

const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

const renderAllocation = (props: Partial<ComponentProps<typeof AllocationBar>>) =>
	render(AllocationBar, {
		props: {
			items: [
				{ name: "A", value: 50000 },
				{ name: "B", value: 30000 },
			],
			...props,
		},
	});

describe("V1 CLS fix — SSR height reservation for client-only charts", () => {
	it("AllocationBar reserves rows*26+24 px (top-N dependent) server-side", () => {
		const { body } = renderAllocation({
			items: Array.from({ length: 5 }, (_, i) => ({ name: `g${i}`, value: 1000 * (i + 1) })),
		});
		// 5 shares → 5 rows → max(5*26+24, 90) = 154
		expect(body).toContain('style="height: 154px"');
		expect(body).not.toContain("<rect"); // no static geometry server-side
	});

	it("AllocationBar reserves the 90px floor when few rows render", () => {
		const { body } = renderAllocation({
			items: [{ name: "only", value: 100 }],
		});
		// 1 row → max(1*26+24, 90) = 90
		expect(body).toContain('style="height: 90px"');
	});

	it("AllocationBar reserves the 'Other' aggregate row when shares exceed TOP_N", () => {
		const { body } = renderAllocation({
			items: Array.from({ length: 12 }, (_, i) => ({ name: `g${i}`, value: 1000 })),
		});
		// 12 shares → top-8 + Other = 9 rows → max(9*26+24, 90) = 258
		expect(body).toContain('style="height: 258px"');
	});

	it("HistoryTrendChart reserves its height prop (default 190) server-side", () => {
		const { body } = render(HistoryTrendChart, {
			props: {
				points: [
					{ month: "2026-01", amountInCents: 100000 },
					{ month: "2026-02", amountInCents: 200000 },
				],
				formatAmount: fmt,
				yearStartMonth: 1,
			},
		});
		expect(body).toContain('style="height: 190px"');
		expect(body).not.toContain("<rect");
	});
});
