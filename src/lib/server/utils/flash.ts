import type { Cookies } from "@sveltejs/kit";

const FLASH_MESSAGE_COOKIE = "flash_message";
const FLASH_TYPE_COOKIE = "flash_type";

export type FlashType = "success" | "error" | "info";

export interface FlashMessage {
	message: string;
	type: FlashType;
}

/**
 * Set a one-time flash message via cookies.
 * Survives redirects, auto-expires after 60 seconds.
 */
export function setFlash(
	cookies: Cookies,
	message: string,
	type: FlashType = "info",
): void {
	const cookieOptions = {
		path: "/",
		maxAge: 60,
		httpOnly: true,
		sameSite: "strict" as const,
		secure: process.env.APP_ENV === "production",
	};

	cookies.set(FLASH_MESSAGE_COOKIE, message, cookieOptions);
	cookies.set(FLASH_TYPE_COOKIE, type, cookieOptions);
}

/**
 * Read and immediately delete flash message cookies.
 * Returns null if no flash message is set.
 * This is a one-time read — calling getFlash twice returns null the second time.
 */
export function getFlash(cookies: Cookies): FlashMessage | null {
	const message = cookies.get(FLASH_MESSAGE_COOKIE);
	const type = cookies.get(FLASH_TYPE_COOKIE) as FlashType | undefined;

	if (!message) return null;

	// Delete immediately after reading (one-time read)
	cookies.delete(FLASH_MESSAGE_COOKIE, { path: "/" });
	cookies.delete(FLASH_TYPE_COOKIE, { path: "/" });

	return { message, type: type || "info" };
}
