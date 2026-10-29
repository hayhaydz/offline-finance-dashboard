import { json, redirect } from "@sveltejs/kit";
import { listImportJobs, runImportWorker } from "$lib/server/import-jobs";
import { logError } from "$lib/server/logger";
import type { RequestHandler } from "./$types";

/**
 * GET /api/import-jobs
 *
 * The importing user's recent background jobs (no payloads — counts and
 * status only). Polling kicks the worker as a safety net in case the
 * enqueue-time kick was lost (e.g. server restarted with queued rows).
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	try {
		void runImportWorker();
		const jobs = await listImportJobs(locals.user.id);
		return json({ jobs });
	} catch (err) {
		logError("api:import-jobs", "Listing import jobs failed", err);
		return json({ jobs: [], error: "Could not list jobs" }, { status: 500 });
	}
};
