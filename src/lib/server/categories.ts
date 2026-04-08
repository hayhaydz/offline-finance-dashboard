import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { spendingCategories } from "$lib/db/schema";
import { devLog, logError } from "$lib/utils/logger";
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
			eq(spendingCategories.userId, userId),
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
			eq(spendingCategories.userId, userId),
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
export async function createCategory(data: CreateCategoryData): Promise<
	| { success: true; slug: string }
	| { success: false; error: string }
> {
	const { userId, name, key, colour } = data;

	if (!name.trim()) {
		return { success: false, error: "Name must not be empty" };
	}

	if (!key.trim()) {
		return { success: false, error: "Key must not be empty" };
	}

	if (!isValidHexColour(colour)) {
		return { success: false, error: "Colour must be a valid hex colour (#RRGGBB)" };
	}

	const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");

	if (!normalizedKey) {
		return { success: false, error: "Key must contain at least one alphanumeric character" };
	}

	// Check for duplicate key among active categories
	const existing = await db.query.spendingCategories.findFirst({
		where: and(
			eq(spendingCategories.userId, userId),
			eq(spendingCategories.key, normalizedKey),
			isNull(spendingCategories.deletedAt),
		),
	});

	if (existing) {
		return { success: false, error: `Category with key "${normalizedKey}" already exists` };
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

		return { success: true, slug };
	} catch (error) {
		logError("categories:create", "Failed to create category", error);
		return { success: false, error: "Failed to create category" };
	}
}

/**
 * Update an existing category's name and/or colour.
 */
export async function updateCategory(
	slug: string,
	userId: number,
	data: { name?: string; colour?: string },
): Promise<{ success: true } | { success: false; error: string }> {
	const { name, colour } = data;

	if (name !== undefined && !name.trim()) {
		return { success: false, error: "Name must not be empty" };
	}

	if (colour !== undefined && !isValidHexColour(colour)) {
		return { success: false, error: "Colour must be a valid hex colour (#RRGGBB)" };
	}

	// Verify category exists and belongs to user
	const existing = await getCategoryBySlug(slug, userId);
	if (!existing) {
		return { success: false, error: "Category not found" };
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

		return { success: true };
	} catch (error) {
		logError("categories:update", "Failed to update category", error);
		return { success: false, error: "Failed to update category" };
	}
}

/**
 * Soft-delete a category by setting deletedAt.
 */
export async function deleteCategory(
	slug: string,
	userId: number,
): Promise<{ success: true } | { success: false; error: string }> {
	const existing = await getCategoryBySlug(slug, userId);
	if (!existing) {
		return { success: false, error: "Category not found" };
	}

	try {
		db.update(spendingCategories)
			.set({ deletedAt: new Date() })
			.where(eq(spendingCategories.slug, slug))
			.run();

		devLog("deleteCategory", "Category soft-deleted", { slug });

		return { success: true };
	} catch (error) {
		logError("categories:delete", "Failed to delete category", error);
		return { success: false, error: "Failed to delete category" };
	}
}
