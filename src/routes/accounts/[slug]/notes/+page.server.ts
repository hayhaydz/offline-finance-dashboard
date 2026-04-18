import { error } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { db } from "$lib/db/client";
import { accountNotes, accounts } from "$lib/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireAuth(locals);

	const accountSlug = params.slug;

	// Get account with ownership validation
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, accountSlug),
	});

	if (!account) {
		error(404, "Account not found");
	}

	validateUserAccess(account, user, "Account");

	// Get all notes for this account
	const notes = await db.query.accountNotes.findMany({
		where: eq(accountNotes.accountId, account.id),
		orderBy: desc(accountNotes.createdAt),
	});

	return {
		account,
		notes,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: account.name, skipLink: false },
			{ segmentIndex: 3, label: "All Notes", skipLink: false },
		],
	};
};
