import { error, redirect } from "@sveltejs/kit";
import {
	buildHistoryCsv,
	historyExportFilename,
	HISTORY_KINDS,
	type HistoryKind,
} from "$lib/server/history-csv";
import { logError } from "$lib/server/logger";
import type { RequestHandler } from "./$types";

/**
 * GET /api/history/export?kind=expenses|income
 *
 * Streams the month-keyed history CSV for the given kind. Authenticated +
 * user-scoped (see history-csv.ts for the RLS filter).
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const kind = url.searchParams.get("kind") ?? "expenses";
	if (!(HISTORY_KINDS as readonly string[]).includes(kind)) {
		error(400, `Unknown history kind '${kind}' (use expenses or income)`);
	}

	try {
		const { csv, meta } = await buildHistoryCsv(
			locals.user.id,
			kind as HistoryKind,
		);
		return new Response(csv, {
			status: 200,
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="${historyExportFilename(
					kind as HistoryKind,
				)}"`,
				"X-Row-Count": String(meta.rowCount),
			},
		});
	} catch (err) {
		logError("api:history:export", "History export failed", err);
		error(500, "Export failed");
	}
};
