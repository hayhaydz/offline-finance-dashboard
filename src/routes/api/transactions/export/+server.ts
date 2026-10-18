import { error, redirect } from "@sveltejs/kit";
import { exportTransactionsCsv, parseExportOptions } from "$lib/server/exports";
import { logError } from "$lib/server/logger";
import type { RequestHandler } from "./$types";

/**
 * GET /api/transactions/export
 *
 * Streams the single multi-account transactions CSV. Query params:
 * `accounts` (comma-separated slugs), `from`/`to` (YYYY-MM-DD), `type`.
 * Authenticated + user-scoped (see exports.ts for the RLS filter).
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}
	const user = locals.user;

	const parsed = parseExportOptions(url.searchParams);
	if (!parsed.ok) {
		error(400, parsed.error);
	}

	try {
		const { csv, filename, rowCount } = await exportTransactionsCsv(
			user.id,
			parsed.options,
		);
		return new Response(csv, {
			status: 200,
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="${filename}"`,
				"X-Row-Count": String(rowCount),
			},
		});
	} catch (err) {
		logError("api:transactions:export", "Export request failed", err);
		error(500, "Export failed");
	}
};
