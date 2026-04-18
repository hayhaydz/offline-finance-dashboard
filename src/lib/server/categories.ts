import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { spendingCategories } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";
import { devLog, logError } from "$lib/server/logger";
import { type Result, type VoidResult, ok, err, okVoid } from "$lib/server/utils/result";
import { isValidHexColour } from "$lib/utils/category-colours";

export interface CreateCategoryData {
	userId: number;
	name: string;
	key: string;
	colour: string;
	isDefault?: boolean;
}

/**
 * Get all active (non-deleted) categories for a user, ordered by name.
 */
export async function getCategories(userId: number) {
	return db.query.spendingCategories.findMany({
		where: and(
			withUserFilter(userId, spendingCategories),
			isNull(spendingCategories.deletedAt),
		),
		orderBy: (categories, { asc }) => [asc(categories.name)],
	});
}

/**
 * Get a single active category by slug and userId.
 */
export async function getCategoryBySlug(slug: string, userId: number) {
	return db.query.spendingCategories.findFirst({
		where: and(
			eq(spendingCategories.slug, slug),
			withUserFilter(userId, spendingCategories),
			isNull(spendingCategories.deletedAt),
		),
	});
}

/**
 * Create a new spending category.
 *
 * Validates name/key non-empty, colour valid hex, checks for duplicate key
 * among active categories, generates a nanoid(16) slug, and normalizes the key.
 */
export async function createCategory(data: CreateCategoryData): Promise<Result<string>> {
	const { userId, name, key, colour } = data;

	if (!name.trim()) {
		return err("Name must not be empty");
	}

	if (!key.trim()) {
		return err("Key must not be empty");
	}

	if (!isValidHexColour(colour)) {
		return err("Colour must be a valid hex colour (#RRGGBB)");
	}

	const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");

	if (!normalizedKey) {
		return err("Key must contain at least one alphanumeric character");
	}

	// Check for duplicate key among active categories
	const existing = await db.query.spendingCategories.findFirst({
		where: and(
			withUserFilter(userId, spendingCategories),
			eq(spendingCategories.key, normalizedKey),
			isNull(spendingCategories.deletedAt),
		),
	});

	if (existing) {
		return err(`Category with key "${normalizedKey}" already exists`);
	}

	const slug = nanoid(16);

	try {
		db.insert(spendingCategories)
			.values({
				slug,
				userId,
				name: name.trim(),
				key: normalizedKey,
				colour,
				isDefault: data.isDefault ?? false,
			})
			.run();

		devLog("createCategory", "Category created", { slug, key: normalizedKey });

		return ok(slug);
	} catch (error) {
		logError("categories:create", "Failed to create category", error);
		return err("Failed to create category");
	}
}

/**
 * Update an existing category's name and/or colour.
 */
export async function updateCategory(
	slug: string,
	userId: number,
	data: { name?: string; colour?: string },
): Promise<VoidResult> {
	const { name, colour } = data;

	if (name !== undefined && !name.trim()) {
		return err("Name must not be empty");
	}

	if (colour !== undefined && !isValidHexColour(colour)) {
		return err("Colour must be a valid hex colour (#RRGGBB)");
	}

	// Verify category exists and belongs to user
	const existing = await getCategoryBySlug(slug, userId);
	if (!existing) {
		return err("Category not found");
	}

	const updates: { name?: string; colour?: string } = {};
	if (name !== undefined) updates.name = name.trim();
	if (colour !== undefined) updates.colour = colour;

	try {
		db.update(spendingCategories)
			.set(updates)
			.where(eq(spendingCategories.slug, slug))
			.run();

		devLog("updateCategory", "Category updated", { slug, updates });

		return okVoid();
	} catch (error) {
		logError("categories:update", "Failed to update category", error);
		return err("Failed to update category");
	}
}

/**
 * Soft-delete a category by setting deletedAt.
 */
export async function deleteCategory(
	slug: string,
	userId: number,
): Promise<VoidResult> {
	const existing = await getCategoryBySlug(slug, userId);
	if (!existing) {
		return err("Category not found");
	}

	try {
		db.update(spendingCategories)
			.set({ deletedAt: new Date() })
			.where(eq(spendingCategories.slug, slug))
			.run();

		devLog("deleteCategory", "Category soft-deleted", { slug });

		return okVoid();
	} catch (error) {
		logError("categories:delete", "Failed to delete category", error);
		return err("Failed to delete category");
	}
}
