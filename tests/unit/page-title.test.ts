// tests/unit/page-title.test.ts
//
// v3 R-H13: per-page document titles. Pure mapping — slug detail pages
// fall back to "DETAIL", month/year segments pass through, unknown
// junk never leaks into the title.

import { describe, expect, it } from "vitest";
import { documentTitle } from "../../src/lib/utils/page-title";

describe("documentTitle (R-H13)", () => {
	it("home and top-level sections", () => {
		expect(documentTitle("/")).toBe("OFFLINE-FINANCE");
		expect(documentTitle("/accounts")).toBe("OFFLINE-FINANCE — ACCOUNTS");
		expect(documentTitle("/goals")).toBe("OFFLINE-FINANCE — GOALS");
		expect(documentTitle("/alerts")).toBe("OFFLINE-FINANCE — ALERTS");
		expect(documentTitle("/tools")).toBe("OFFLINE-FINANCE — TOOLS");
	});

	it("nested sections join with a middle dot", () => {
		expect(documentTitle("/overview/reports")).toBe("OFFLINE-FINANCE — OVERVIEW · REPORTS");
		expect(documentTitle("/settings/data")).toBe("OFFLINE-FINANCE — SETTINGS · DATA MANAGEMENT");
		expect(documentTitle("/settings/profile")).toBe("OFFLINE-FINANCE — SETTINGS · PROFILE & SESSION");
		expect(documentTitle("/accounts/liabilities")).toBe("OFFLINE-FINANCE — ACCOUNTS · LIABILITIES");
	});

	it("month and tax-year segments pass through", () => {
		expect(documentTitle("/overview/budgets/2026-10")).toBe(
			"OFFLINE-FINANCE — OVERVIEW · BUDGETS · 2026-10",
		);
		expect(documentTitle("/accounts/interest/2026-27")).toBe(
			"OFFLINE-FINANCE — ACCOUNTS · INTEREST · 2026-27",
		);
	});

	it("nanoid slug detail pages collapse to DETAIL and stop there", () => {
		expect(documentTitle("/accounts/OfqAbB0JUox230vH")).toBe("OFFLINE-FINANCE — ACCOUNTS · DETAIL");
		expect(documentTitle("/goals/debt/clear-mastercard")).toBe(
			"OFFLINE-FINANCE — GOALS · DEBT PAYOFF · DETAIL",
		);
		expect(documentTitle("/overview/snapshots/abc123def456ghi789jkl/notes/xyz123abc456def789ghi")).toBe(
			"OFFLINE-FINANCE — OVERVIEW · SNAPSHOTS · DETAIL",
		);
	});

	it("auth routes and unknown junk", () => {
		expect(documentTitle("/login")).toBe("OFFLINE-FINANCE — LOGIN");
		expect(documentTitle("/unlock")).toBe("OFFLINE-FINANCE — UNLOCK");
		// long unrecognised segments are slugs in practice → honest DETAIL
		expect(documentTitle("/totally-unknown-path")).toBe("OFFLINE-FINANCE — DETAIL");
	});
});
