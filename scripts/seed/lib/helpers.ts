import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pence = (pounds: number) => Math.round(pounds * 100);
export const slug = () => nanoid(16);
export const daysAgo = (n: number): Date => {
	const d = new Date();
	d.setDate(d.getDate() - n);
	d.setHours(0, 0, 0, 0);
	return d;
};
export const randomBetween = (min: number, max: number) =>
	Math.floor(Math.random() * (max - min + 1)) + min;
export const formatGBP = (cents: number) =>
	new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
		cents / 100,
	);

/** Load a JSON fixture relative to scripts/seed/fixtures/. */
export function loadFixture<T>(relativePath: string): T {
	const fullPath = join(__dirname, "..", "fixtures", relativePath);
	return JSON.parse(readFileSync(fullPath, "utf-8")) as T;
}
