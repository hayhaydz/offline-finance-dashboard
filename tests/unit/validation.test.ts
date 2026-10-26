import { describe, expect, it } from "vitest";
import * as rules from "$lib/validation/rules";

describe("validation rules", () => {
	describe("required", () => {
		const rule = rules.required();
		it("should fail on empty string", () => {
			expect(rule.validate("")).toBe(false);
		});
		it("should fail on whitespace only", () => {
			expect(rule.validate("   ")).toBe(false);
		});
		it("should pass on non-empty string", () => {
			expect(rule.validate("value")).toBe(true);
		});
	});

	describe("minLength", () => {
		const rule = rules.minLength(5);
		it("should fail if too short", () => {
			expect(rule.validate("1234")).toBe(false);
		});
		it("should pass if exact length", () => {
			expect(rule.validate("12345")).toBe(true);
		});
		it("should pass if longer than min", () => {
			expect(rule.validate("123456")).toBe(true);
		});
	});

	describe("email", () => {
		const rule = rules.email();
		it("should fail on invalid format", () => {
			expect(rule.validate("invalid-email")).toBe(false);
			expect(rule.validate("test@example")).toBe(false);
			expect(rule.validate("@example.com")).toBe(false);
		});
		it("should pass on valid email", () => {
			expect(rule.validate("test@example.com")).toBe(true);
			expect(rule.validate("user.name+suffix@domain.co.uk")).toBe(true);
		});
	});

	describe("matches", () => {
		const rule = rules.matches("password");
		it("should fail if values do not match", () => {
			const formData = { password: "secret123" };
			expect(rule.validate("secret456", formData)).toBe(false);
		});
		it("should pass if values match", () => {
			const formData = { password: "secret123" };
			expect(rule.validate("secret123", formData)).toBe(true);
		});
	});

	describe("strongPassword", () => {
		const subRules = rules.strongPassword(12);
		const validateAll = (val: string) => subRules.every((r) => r.validate(val));

		it("should fail if missing uppercase", () => {
			expect(validateAll("password123!")).toBe(false);
		});
		it("should fail if missing lowercase", () => {
			expect(validateAll("PASSWORD123!")).toBe(false);
		});
		it("should fail if missing number", () => {
			expect(validateAll("Password!!!")).toBe(false);
		});
		it("should fail if missing special", () => {
			expect(validateAll("Password1234")).toBe(false);
		});
		it("should fail if too short", () => {
			expect(validateAll("Pass1!")).toBe(false);
		});
		it("should pass on strong password", () => {
			expect(validateAll("SecurePass123!")).toBe(true);
		});
	});
});
