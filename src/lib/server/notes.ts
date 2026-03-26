import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { accountNotes } from "$lib/db/schema";
import { FIELD_LIMITS } from "$lib/utils/fieldLimits";
import { devLog } from "$lib/utils/logger";

export interface CreateNoteData {
	accountId: number;
	content: string;
}

export async function createNote(
	data: CreateNoteData,
): Promise<{ success: boolean; noteSlug: string }> {
	// Validate content length
	if (data.content.length > FIELD_LIMITS.NOTE_CONTENT) {
		throw new Error(
			`Note content exceeds maximum length of ${FIELD_LIMITS.NOTE_CONTENT} characters`,
		);
	}

	if (data.content.trim().length === 0) {
		throw new Error("Note content cannot be empty");
	}

	const slug = nanoid(21);

	await db.insert(accountNotes).values({
		slug,
		accountId: data.accountId,
		content: data.content.trim(),
		createdAt: new Date(),
	});

	devLog("createNote", "Note created", {
		noteSlug: slug,
		accountId: data.accountId,
		contentLength: data.content.length,
	});

	return { success: true, noteSlug: slug };
}

export async function getNotesByAccountId(accountId: number) {
	const notes = await db.query.accountNotes.findMany({
		where: eq(accountNotes.accountId, accountId),
		orderBy: desc(accountNotes.createdAt),
	});

	return notes;
}

export async function getNoteBySlug(slug: string) {
	const note = await db.query.accountNotes.findFirst({
		where: eq(accountNotes.slug, slug),
	});

	return note ?? null;
}

export async function deleteNote(slug: string): Promise<void> {
	await db.delete(accountNotes).where(eq(accountNotes.slug, slug));

	devLog("deleteNote", "Note deleted", { noteSlug: slug });
}
