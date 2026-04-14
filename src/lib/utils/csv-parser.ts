/**
 * CSV Parser for Transaction Imports
 *
 * Hand-rolled parser that validates transaction CSV files against a strict schema.
 * Supports 4-column (date, type, amount, description) and 5-column (with category) formats.
 * Skips comment lines starting with '#' (used in CSV templates) and empty lines.
 * Handles quoted fields containing commas.
 */

// All 13 transaction types from the accountTransactions DB table
import { TRANSACTION_TYPES } from "$lib/utils/domain-constants";
import type { TransactionType } from "$lib/utils/domain-constants";

const VALID_TRANSACTION_TYPES = TRANSACTION_TYPES;

interface ParseError {
	row: number;
	column: string;
	message: string;
}

interface ParsedRow {
	date: string;
	type: TransactionType;
	amount: number;
	description: string;
	category?: string;
	rowIndex: number;
}

interface CsvParseResult {
	valid: ParsedRow[];
	errors: ParseError[];
	totalRows: number;
}

const DESCRIPTION_MAX_LENGTH = 500;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HEADER_4 = "date,type,amount,description";
const HEADER_5 = "date,type,amount,description,category";

function parseRow(
	line: string,
	rowIndex: number,
	hasCategory: boolean,
): { parsed: ParsedRow | null; error: ParseError | null } {
	// Split fields respecting quoted values containing commas
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === "," && !inQuotes) {
			fields.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	fields.push(current.trim());

	const expectedFieldCount = hasCategory ? 5 : 4;
	if (fields.length !== expectedFieldCount) {
		return {
			parsed: null,
			error: {
				row: rowIndex,
				column: "fields",
				message: `Expected ${expectedFieldCount} fields but got ${fields.length}`,
			},
		};
	}

	// Validate date (YYYY-MM-DD)
	const rawDate = fields[0];
	if (!DATE_REGEX.test(rawDate)) {
		return {
			parsed: null,
			error: {
				row: rowIndex,
				column: "date",
				message: `Invalid date format '${rawDate}'. Expected YYYY-MM-DD`,
			},
		};
	}

	// Validate transaction type
	const rawType = fields[1];
	if (!VALID_TRANSACTION_TYPES.includes(rawType as TransactionType)) {
		return {
			parsed: null,
			error: {
				row: rowIndex,
				column: "type",
				message: `Invalid transaction type '${rawType}'`,
			},
		};
	}

	// Validate amount
	const rawAmount = fields[2];
	const amount = parseFloat(rawAmount);
	if (isNaN(amount)) {
		return {
			parsed: null,
			error: {
				row: rowIndex,
				column: "amount",
				message: `Invalid amount '${rawAmount}'. Must be a valid number`,
			},
		};
	}

	// Validate description
	const description = fields[3];
	if (description.length > DESCRIPTION_MAX_LENGTH) {
		return {
			parsed: null,
			error: {
				row: rowIndex,
				column: "description",
				message: `Description exceeds ${DESCRIPTION_MAX_LENGTH} characters`,
			},
		};
	}

	// Optional category
	const rawCategory = hasCategory ? fields[4] : undefined;
	const category = rawCategory && rawCategory.length > 0 ? rawCategory : undefined;

	return {
		parsed: {
			date: rawDate,
			type: rawType as TransactionType,
			amount,
			description,
			category,
			rowIndex,
		},
		error: null,
	};
}

function parseCSV(csv: string): CsvParseResult {
	const trimmed = csv.trim();
	const lines = trimmed.split("\n").map((l) => l.trimEnd());

	// Strip comment lines and empty lines, but keep track of non-comment/non-empty lines
	const dataLines: string[] = [];
	for (const line of lines) {
		const stripped = line.trim();
		if (stripped === "" || stripped.startsWith("#")) continue;
		dataLines.push(stripped);
	}

	if (dataLines.length === 0) {
		return {
			valid: [],
			errors: [{ row: 0, column: "header", message: "No data rows found" }],
			totalRows: 0,
		};
	}

	// Validate header
	const header = dataLines[0].toLowerCase().trim();
	const hasCategory = header === HEADER_5;

	if (header !== HEADER_4 && header !== HEADER_5) {
		return {
			valid: [],
			errors: [
				{
					row: 0,
					column: "header",
					message: `Invalid header '${dataLines[0]}'. Expected '${HEADER_4}' or '${HEADER_5}'`,
				},
			],
			totalRows: 0,
		};
	}

	const bodyLines = dataLines.slice(1);

	if (bodyLines.length === 0) {
		return {
			valid: [],
			errors: [
				{ row: 0, column: "data", message: "No data rows found" },
			],
			totalRows: 0,
		};
	}

	const valid: ParsedRow[] = [];
	const errors: ParseError[] = [];

	for (let i = 0; i < bodyLines.length; i++) {
		const rowIndex = i + 1; // 1-based, header is row 0
		const result = parseRow(bodyLines[i], rowIndex, hasCategory);
		if (result.error) {
			errors.push(result.error);
		}
		if (result.parsed) {
			valid.push(result.parsed);
		}
	}

	return { valid, errors, totalRows: bodyLines.length };
}

export { parseCSV, VALID_TRANSACTION_TYPES };
export type { ParseError, ParsedRow, CsvParseResult, TransactionType };
