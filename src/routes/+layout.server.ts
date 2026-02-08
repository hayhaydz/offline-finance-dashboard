import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const appEnv = process.env.APP_ENV || 'unknown';
	const hasEncryptionKey = !!process.env.ENCRYPTION_KEY;

	return {
		user: locals.user ? {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt
		} : null,
		session: locals.session ?? null,
		environment: {
			mode: appEnv,
			isProduction: appEnv === 'production',
			hasEncryption: hasEncryptionKey
		}
	};
};
