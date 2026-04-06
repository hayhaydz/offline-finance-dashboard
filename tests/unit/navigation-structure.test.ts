import { describe, expect, it } from "vitest";

describe("navigation structure", () => {
  it("has Goals dropdown with Savings and Debt Payoff children", () => {
    const expectedStructure = {
      href: "/goals",
      label: "Goals",
      children: [
        { href: "/goals", label: "Savings Goals" },
        { href: "/goals/debt", label: "Debt Payoff" },
      ],
    };
    expect(expectedStructure.children).toHaveLength(2);
    expect(expectedStructure.children[1].href).toBe("/goals/debt");
  });
});
