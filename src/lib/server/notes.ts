import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { accountNotes } from "$lib/db/schema";
import { FIELD_LIMITS } from "$lib/utils/fieldLimits";
import { sanitizeNoteContent } from "$lib/utils/sanitize";
import { devLog } from "$lib/server/logger";
import { type Result, ok, err } from "$lib/server/utils/result";

export interface CreateNoteData {
	accountId: number;
	content: string;
}

export async function createNote(
	data: CreateNoteData,
): Promise<Result<string>> {
	// Validate content length
	if (data.content.length > FIELD_LIMITS.NOTE_CONTENT) {
		return err(
			`Note content exceeds maximum length of ${FIELD_LIMITS.NOTE_CONTENT} characters`,
		);
	}

	if (data.content.trim().length === 0) {
		return err("Note content cannot be empty");
	}

	const slug = nanoid(21);
	const sanitizedContent = sanitizeNoteContent(data.content.trim());

	await db.insert(accountNotes).values({
		slug,
		accountId: data.accountId,
		content: sanitizedContent,
		createdAt: new Date(),
	});

	devLog("createNote", "Note created", {
		noteSlug: slug,
		accountId: data.accountId,
		contentLength: sanitizedContent.length,
	});

	return ok(slug);
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
