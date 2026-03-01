import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	// Redirect to profile as the default settings page
	redirect(302, "/settings/profile");
};
