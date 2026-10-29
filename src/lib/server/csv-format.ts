/**
 * Shared CSV format for the transaction export / reimport round-trip.
 *
 * One canonical 8-column header is used by the export writer, the reimport
 * backup writer and the reimport parser, so column parity between the three
 * is enforced by construction:
 *
 *   account_slug,id,date,type,amount,description,category,_delete
 *
 * - `account_slug` + `id` identify each row (ids live in CSV cells and the
 *   DB only — never in URLs).
 * - `amount` is signed decimal pounds ("123.45", "-50.00").
 * - `date` is YYYY-MM-DD (UTC).
 * - `_delete` is empty on exports; set to 1 in a reimport file to hard-delete.
 * - Comment lines starting with `#` are ignored (backup files carry a
 *   `# backup of ... at <timestamp>` header line).
 */

export const TRANSACTION_CSV_COLUMNS = [
	"account_slug",
	"id",
	"date",
	"type",
	"amount",
	"description",
	"category",
	"_delete",
] as const;

export const TRANSACTION_CSV_HEADER = TRANSACTION_CSV_COLUMNS.join(",");

/** Backup header line: `# backup of <scope> at <ISO timestamp>` */
export const BACKUP_HEADER_PREFIX = "# backup of ";

const BACKUP_HEADER_PATTERN =
	/^#\s*backup of\s+(.+?)\s+at\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/;

/**
 * Detect a reimport backup file's header line. Returns the parsed scope and
 * timestamp when the line matches, null otherwise.
 */
export function parseBackupHeaderLine(
	line: string,
): { scope: string; timestamp: string } | null {
	const match = BACKUP_HEADER_PATTERN.exec(line.trim());
	if (!match) return null;
	return { scope: match[1], timestamp: match[2] };
}

/**
 * CSV field escaping: wrap in double quotes when the value contains a comma,
 * quote, newline or carriage return; embedded quotes are doubled.
 */
export function csvEscape(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/** Signed cents → decimal pounds string ("123.45", "-50.00"). */
export function centsToPoundsString(cents: number): string {
	return (cents / 100).toFixed(2);
}

/** Canonical serialisable row shape shared by export and backup writers. */
export interface TransactionCsvRow {
	accountSlug: string;
	/** Numeric transaction id; empty string for rows without an id (inserts). */
	id: string;
	/** YYYY-MM-DD */
	date: string;
	type: string;
	/** Signed cents */
	amountCents: number;
	description: string | null;
	category: string | null;
	deleteFlag: boolean;
}

/** Serialise rows (plus optional leading comment lines) into CSV text. */
export function serializeTransactionCsv(
	rows: TransactionCsvRow[],
	comments: string[] = [],
): string {
	const lines = [...comments, TRANSACTION_CSV_HEADER];
	for (const row of rows) {
		lines.push(
			[
				csvEscape(row.accountSlug),
				row.id,
				row.date,
				row.type,
				centsToPoundsString(row.amountCents),
				csvEscape(row.description ?? ""),
				csvEscape(row.category ?? ""),
				row.deleteFlag ? "1" : "",
			].join(","),
		);
	}
	return `${lines.join("\n")}\n`;
}

/** UTC YYYY-MM-DD for a stored transactionDate. */
export function utcDateString(date: Date): string {
	return date.toISOString().split("T")[0];
}

/**
 * Split a CSV line into fields, respecting quoted values. Doubled quotes
 * inside a quoted field decode to a single literal quote (RFC 4180).
 * Shared by the reimport parser and the bulk bank-import mapper.
 */
export function splitCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			fields.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	fields.push(current.trim());
	return fields;
}

/**
 * Parse a full CSV document into rows of fields (RFC 4180 quoting,
 * including quoted fields containing embedded newlines — bank exports
 * put multi-line notes in quoted cells). Blank lines and `#` comment
 * lines are skipped.
 */
export function parseCsvDocument(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let current = "";
	let inQuotes = false;

	const endField = () => {
		row.push(current.trim());
		current = "";
	};
	const endRow = () => {
		endField();
		if (row.some((field) => field !== "")) rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			endField();
		} else if (char === "\n") {
			endRow();
		} else if (char === "\r") {
			// handled by the \n that follows (or end of text)
		} else {
			current += char;
		}
	}
	if (current !== "" || row.length > 0) endRow();

	return rows.filter((fields) => !(fields.length === 1 && fields[0].startsWith("#")));
}
