import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTypeExclusions } from "$lib/server/exclusions";
import { actions } from "../../src/routes/+page.server";

vi.mock("$lib/db/client", () => ({
	db: {
		query: {
			accounts: {
				findMany: vi.fn().mockResolvedValue([]),
			},
			goals: {
				findMany: vi.fn().mockResolvedValue([]),
			},
		},
	},
}));

vi.mock("$lib/server/exclusions", () => ({
	updateTypeExclusions: vi.fn(),
}));

describe("Homepage exclusions action", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns success no-op when no matching accounts are found", async () => {
		(updateTypeExclusions as any).mockResolvedValue({
			affectedRows: 0,
			message: "No matching open accounts to update",
		});

		const formData = new FormData();
		formData.append("type_savings", "1");
		const request = new Request("http://localhost/?/updateExclusions", {
			method: "POST",
			body: formData,
		});

		const result = await (actions.updateExclusions as any)({
			request,
			locals: { user: { id: 1, username: "tester", createdAt: new Date() } },
		});

		expect(result.success).toBe("No matching open accounts to update");
		expect(updateTypeExclusions).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 1 }),
		);
	});
});
