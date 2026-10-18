import { fail } from "@sveltejs/kit";
import { devLog, logError, logFormData } from "$lib/server/logger";
import {
	addTaxBandRow,
	applyBandVerdict,
	closeTaxBandRow,
	deleteTaxBandRow,
	getBandFinderReport,
	getTaxBandHistory,
	normalizeEffectiveFromInput,
	reopenTaxBandRow,
} from "$lib/server/tax-bands";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import { parseCurrency } from "$lib/utils/currency";
import {
	type TaxBand,
	taxYearLabelFromDate,
	toCanonicalTaxYear,
} from "$lib/utils/tax-year-utils";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireAuth(locals);

	// Finder projection assumption override (?assumptionYear=2026/27&assumption=5200)
	const assumptionYearParam = url.searchParams.get("assumptionYear");
	const assumptionParam = url.searchParams.get("assumption");
	const projectionOverrides: Record<string, number> = {};
	if (assumptionYearParam && assumptionParam) {
		const canonical = toCanonicalTaxYear(assumptionYearParam);
		let value: number | null = null;
		try {
			value = parseCurrency(assumptionParam);
		} catch {
			value = null;
		}
		if (canonical && value !== null && value >= 0) {
			projectionOverrides[canonical] = value; // parseCurrency returns pence
		}
	}

	const [bandHistory, finder] = await Promise.all([
		getTaxBandHistory(user.id),
		getBandFinderReport(user.id, { projectionOverrides }),
	]);

	return {
		currentTaxYear: taxYearLabelFromDate(new Date()),
		bandHistory: [...bandHistory].reverse(), // newest first for display
		finder,
		assumptionYear: assumptionYearParam,
	};
};

const VALID_BANDS: TaxBand[] = ["basic", "higher", "additional"];

export const actions: Actions = {
	/** Add a band history row (overlap-validated, year-atomic normalised). */
	addBand: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("tax-section:addBand", Object.fromEntries(formData));

		const band = formData.get("band") as string;
		const effectiveFrom = (formData.get("effectiveFrom") as string)?.trim();
		const toTaxYearRaw = (formData.get("toTaxYear") as string)?.trim();

		if (!VALID_BANDS.includes(band as TaxBand)) {
			return fail(400, { error: "Invalid tax band" });
		}
		if (!effectiveFrom) {
			return fail(400, { error: "Effective from is required" });
		}

		const fromTaxYear = normalizeEffectiveFromInput(effectiveFrom);
		if (!fromTaxYear) {
			return fail(400, {
				error:
					"Enter a tax year (2026/27), month (2026-07) or date (2026-07-15)",
			});
		}
		const toTaxYear =
			toTaxYearRaw && toTaxYearRaw !== ""
				? normalizeEffectiveFromInput(toTaxYearRaw)
				: null;
		if (toTaxYearRaw && toTaxYearRaw !== "" && !toTaxYear) {
			return fail(400, { error: "Invalid end tax year" });
		}

		const result = await addTaxBandRow(user.id, {
			band: band as TaxBand,
			fromTaxYear,
			toTaxYear,
		});
		if (!result.ok) {
			return fail(400, { error: result.error });
		}

		// Year-atomic rule: a mid-year/month input was normalised to a tax year
		const midYear =
			!toCanonicalTaxYear(effectiveFrom) && fromTaxYear !== effectiveFrom;

		devLog("tax-section:addBand", "Band added", {
			userId: user.id,
			band,
			fromTaxYear,
		});

		return {
			success: true,
			message: `${band} recorded from ${fromTaxYear}${midYear ? " (bands are tax-year atomic — the whole year uses this band)" : ""}`,
		};
	},

	/** Close an open band row at a tax year (inclusive). */
	closeBand: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const id = Number(formData.get("id"));
		const toTaxYearRaw = (formData.get("toTaxYear") as string)?.trim();

		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { error: "Invalid band row" });
		}
		const toTaxYear = toTaxYearRaw
			? normalizeEffectiveFromInput(toTaxYearRaw)
			: null;
		if (!toTaxYear) {
			return fail(400, { error: "Enter a valid end tax year (e.g. 2025/26)" });
		}

		const result = await closeTaxBandRow(user.id, id, toTaxYear);
		if (!result.ok) return fail(400, { error: result.error });

		return { success: true, message: `Band closed at ${toTaxYear}` };
	},

	/** Reopen a closed band row (open-ended again). */
	reopenBand: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const id = Number(formData.get("id"));
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { error: "Invalid band row" });
		}

		const result = await reopenTaxBandRow(user.id, id);
		if (!result.ok) return fail(400, { error: result.error });

		return { success: true, message: "Band reopened (open-ended)" };
	},

	/** Delete a band history row. */
	deleteBand: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const id = Number(formData.get("id"));
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { error: "Invalid band row" });
		}

		const result = await deleteTaxBandRow(user.id, id);
		if (!result.ok) return fail(400, { error: result.error });

		return { success: true, message: "Band row deleted" };
	},

	/** Apply a finder verdict as a band row — explicit user action only. */
	applyBand: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("tax-section:applyBand", Object.fromEntries(formData));

		const taxYearRaw = (formData.get("taxYear") as string)?.trim();
		const band = formData.get("band") as string;

		const taxYear = toCanonicalTaxYear(taxYearRaw ?? "");
		if (!taxYear) return fail(400, { error: "Invalid tax year" });
		if (!VALID_BANDS.includes(band as TaxBand)) {
			return fail(400, { error: "Invalid tax band" });
		}

		try {
			const result = await applyBandVerdict(user.id, taxYear, band as TaxBand);
			if (!result.ok) return fail(400, { error: result.error });
			return { success: true, message: result.message };
		} catch (err) {
			logError("tax-section:applyBand", "Failed to apply verdict", err);
			return fail(500, { error: "Failed to apply band. Please try again." });
		}
	},
};
