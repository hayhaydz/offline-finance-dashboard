import { error, redirect } from "@sveltejs/kit";
import { readBackupFile } from "$lib/server/imports-update";
import { logError } from "$lib/server/logger";
import type { RequestHandler } from "./$types";

/**
 * GET /api/transactions/backup?file=<filename>
 *
 * Streams one of the user's reimport backup files. The filename must match
 * the generated pattern and the file is read from the requesting user's own
 * backup directory — foreign users' backups are unreachable.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}
	const user = locals.user;

	const filename = url.searchParams.get("file");
	if (filename === null) {
		error(400, "Missing file parameter");
	}

	let content: string | null;
	try {
		content = await readBackupFile(user.id, filename);
	} catch (err) {
		logError("api:transactions:backup", "Backup download failed", err);
		error(500, "Backup download failed");
	}

	if (content === null) {
		error(404, "Backup not found");
	}

	return new Response(content, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
};
