import { describe, expect, it } from "vitest";
import { setFlash, getFlash } from "$lib/server/utils/flash";

function createMockCookies() {
	const store = new Map<string, string>();
	return {
		get: (name: string) => store.get(name) ?? undefined,
		set: (name: string, value: string) => {
			store.set(name, value);
		},
		delete: (name: string) => {
			store.delete(name);
		},
		getAll: () =>
			Array.from(store.entries()).map(([name, value]) => ({ name, value })),
		serialize: () => "",
	};
}

describe("Flash message utility", () => {
	it("sets and gets a flash message", () => {
		const cookies = createMockCookies();
		setFlash(cookies, "Test message", "success");

		const flash = getFlash(cookies as any);
		expect(flash).toEqual({ message: "Test message", type: "success" });
	});

	it("returns null when no flash message is set", () => {
		const cookies = createMockCookies();
		const flash = getFlash(cookies as any);
		expect(flash).toBeNull();
	});

	it("deletes cookies after reading (one-time read)", () => {
		const cookies = createMockCookies();
		setFlash(cookies, "First read", "info");

		const first = getFlash(cookies as any);
		expect(first).toEqual({ message: "First read", type: "info" });

		const second = getFlash(cookies as any);
		expect(second).toBeNull();
	});

	it("defaults type to info when not specified", () => {
		const cookies = createMockCookies();
		setFlash(cookies, "Hello");

		const flash = getFlash(cookies as any);
		expect(flash?.type).toBe("info");
	});

	it("can set error type flash messages", () => {
		const cookies = createMockCookies();
		setFlash(cookies, "Something went wrong", "error");

		const flash = getFlash(cookies as any);
		expect(flash).toEqual({
			message: "Something went wrong",
			type: "error",
		});
	});
});
