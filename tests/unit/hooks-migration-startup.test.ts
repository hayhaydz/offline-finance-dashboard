import { beforeEach, describe, expect, it, vi } from "vitest";

type Deferred = {
	promise: Promise<void>;
	resolve: () => void;
};

function createDeferred(): Deferred {
	let resolve = () => {};
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe("hooks startup migration gate", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("waits for startup migrations before resolving a request", async () => {
		const deferred = createDeferred();

		vi.doMock("$lib/db/migrate", () => ({
			runMigrations: vi.fn(() => deferred.promise),
		}));

		vi.doMock("$lib/db/client", () => ({
			db: {
				query: { sessions: { findFirst: vi.fn() } },
				delete: vi.fn(),
				update: vi.fn(),
			},
		}));

		vi.doMock("$lib/server/logger", () => ({
			logError: vi.fn(),
		}));

		const { handle } = await import("../../src/hooks.server");
		const resolve = vi.fn(async () => new Response("ok", { status: 200 }));

		const handlePromise = handle({
			event: {
				url: new URL("http://localhost/"),
				cookies: { get: vi.fn(() => undefined), delete: vi.fn() },
				locals: {},
				getClientAddress: () => "127.0.0.1",
				request: new Request("http://localhost/"),
			},
			resolve,
		} as any);

		await Promise.resolve();
		expect(resolve).not.toHaveBeenCalled();

		deferred.resolve();
		await handlePromise;

		expect(resolve).toHaveBeenCalledTimes(1);
	});
});
