import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountNotes } from "$lib/db/schema";
import { devLog, logError } from "$lib/utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const accountSlug = params.slug;
	const noteSlug = params.noteSlug;

	// Get account with ownership validation
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug),
	});

	if (!account) {
		logError("noteDetail", "Account not found", {
			accountSlug,
			noteSlug,
			userId: locals.user.id,
		});
		error(404, "Account not found");
	}

	validateUserAccess(account, locals.user, "Account");

	// Get the note
	const note = await db.query.accountNotes.findFirst({
		where: eq(accountNotes.slug, noteSlug),
	});

	if (!note) {
		logError("noteDetail", "Note not found", {
			accountSlug,
			noteSlug,
			userId: locals.user.id,
		});
		error(404, "Note not found");
	}

	// Verify note belongs to this account
	if (note.accountId !== account.id) {
		logError("noteDetail", "Note does not belong to account", {
			accountSlug,
			noteSlug,
			accountId: account.id,
			noteAccountId: note.accountId,
		});
		error(404, "Note not found");
	}

	devLog("noteDetail", "Note loaded", {
		accountSlug,
		noteSlug,
		contentLength: note.content.length,
	});

	return {
		account,
		note,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false },
			{ segmentIndex: 3, label: "Notes", skipLink: true },
			{ segmentIndex: 4, label: "Note", skipLink: false },
		],
	};
};
