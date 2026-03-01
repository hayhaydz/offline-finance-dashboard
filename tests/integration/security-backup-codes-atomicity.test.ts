import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions } from "../../src/routes/settings/security/+page.server";

let backupCodeState: Array<{ code: string; used: boolean }> = [];
let failOnSecondInsert = false;

vi.mock("$lib/db/client", () => {
	const db = {
		transaction: vi.fn(async (fn: any) => {
			const snapshot = backupCodeState.map((c) => ({ ...c }));
			let insertCalls = 0;
			const tx = {
				delete: vi.fn(() => ({
					where: vi.fn(async () => {
						backupCodeState = [];
						return true;
					}),
				})),
				insert: vi.fn(() => ({
					values: vi.fn(async (row: any) => {
						insertCalls++;
						backupCodeState.push({ code: row.code, used: row.used });
						if (failOnSecondInsert && insertCalls === 2) {
							throw new Error("forced insert failure");
						}
						return true;
					}),
				})),
			};

			try {
				return await fn(tx);
			} catch (error) {
				backupCodeState = snapshot;
				throw error;
			}
		}),
		delete: vi.fn(() => ({ where: vi.fn(async () => true) })),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(async () => [
						{
							id: 1,
							username: "tester",
							mfaSetupToken: null,
							createdAt: new Date(),
						},
					]),
				})),
			})),
		})),
		query: {
			backupCodes: {
				findMany: vi.fn(async () => []),
			},
		},
	};
	return { db };
});

vi.mock("$lib/auth/mfa", () => ({
	generateBackupCodes: vi.fn(() => ["AAAA1111", "BBBB2222", "CCCC3333"]),
}));

vi.mock("$lib/auth/password", () => ({
	verifyPassword: vi.fn(),
	hashPassword: vi.fn(async (input: string) => `hash:${input}`),
}));

describe("Security backup codes transaction atomicity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failOnSecondInsert = false;
		backupCodeState = [
			{ code: "existing1", used: false },
			{ code: "existing2", used: true },
		];
	});

	it("rolls back when regeneration insert fails", async () => {
		failOnSecondInsert = true;

		const request = new Request(
			"http://localhost/settings/security?/regenerateBackupCodes",
			{
				method: "POST",
				body: new FormData(),
			},
		);

		const result = await (actions.regenerateBackupCodes as any)({
			request,
			locals: { user: { id: 1, username: "tester", createdAt: new Date() } },
		});

		expect(result.status).toBe(500);
		expect(result.data.error).toBe("Failed to regenerate backup codes");
		expect(backupCodeState).toEqual([
			{ code: "existing1", used: false },
			{ code: "existing2", used: true },
		]);
	});
});
