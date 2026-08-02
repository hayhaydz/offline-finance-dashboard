const DEFAULT_SENSITIVE_FIELDS = [
	"password",
	"totpSecret",
	"totpCode",
	"backupCodes",
	"backupCode",
	"token",
	"secret",
	"apiKey",
] as const;

export function maskSensitiveData(
	data: unknown,
	sensitiveFields: readonly string[] = DEFAULT_SENSITIVE_FIELDS,
): unknown {
	if (!data || typeof data !== "object") {
		return data;
	}

	if (Array.isArray(data)) {
		return data.map((item) => maskSensitiveData(item, sensitiveFields));
	}

	const masked: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();
		const isSensitive = sensitiveFields.some((field) =>
			lowerKey.includes(field.toLowerCase()),
		);

		if (isSensitive) {
			masked[key] = "[REDACTED]";
		} else if (typeof value === "object" && value !== null) {
			masked[key] = maskSensitiveData(value, sensitiveFields);
		} else {
			masked[key] = value;
		}
	}

	return masked;
}
