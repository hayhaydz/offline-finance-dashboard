import { userDto } from "$lib/server/utils/auth-guard";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
	const appEnv = process.env.APP_ENV || "unknown";
	const hasEncryptionKey = !!process.env.ENCRYPTION_KEY;

	return {
		user: locals.user ? userDto(locals.user) : null,
		environment: {
			mode: appEnv,
			isProduction: appEnv === "production",
			hasEncryption: hasEncryptionKey,
		},
	};
};
