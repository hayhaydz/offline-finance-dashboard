import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import { validateUserAccess } from "$lib/auth/row-security";
import { logError } from "$lib/server/logger";

export async function requireAccountOwnership(
	locals: App.Locals,
	slug: string,
) {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const account = await db.query.accounts.findFirst({
		where: eq(accounts.slug, slug),
	});

	if (!account) {
		logError("account-ownership", "Account not found", { slug });
		error(404, "Account not found");
	}

	// validateUserAccess is an assertion function — throws on access denied
	validateUserAccess(account, locals.user, "Account");
	return account;
}
