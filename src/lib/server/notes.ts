import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { accountNotes } from "$lib/db/schema";
import {
	decryptNoteContent,
	encryptNoteContent,
} from "$lib/server/crypto/protected-fields";
import { logInfo } from "$lib/server/logger";
import { err, ok, type Result } from "$lib/server/utils/result";
import { FIELD_LIMITS } from "$lib/utils/fieldLimits";
import { sanitizeNoteContent } from "$lib/utils/sanitize";

export interface CreateNoteData {
	accountId: number;
	content: string;
	userId: number;
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
		// Value layer: note body encrypted under the user's DataKey,
		// AAD-bound to this note's slug.
		content: encryptNoteContent(data.userId, slug, sanitizedContent),
		createdAt: new Date(),
	});

	logInfo("createNote", "Note created", {
		noteSlug: slug,
		accountId: data.accountId,
		contentLength: sanitizedContent.length,
	});

	return ok(slug);
}

export async function getNotesByAccountId(accountId: number, userId: number) {
	const notes = await db.query.accountNotes.findMany({
		where: eq(accountNotes.accountId, accountId),
		orderBy: desc(accountNotes.createdAt),
	});

	return notes.map((note) => ({
		...note,
		content: decryptNoteContent(userId, note.slug, note.content),
	}));
}

export async function getNoteBySlug(slug: string, userId: number) {
	const note = await db.query.accountNotes.findFirst({
		where: eq(accountNotes.slug, slug),
	});

	if (!note) return null;
	return {
		...note,
		content: decryptNoteContent(userId, note.slug, note.content),
	};
}

export async function deleteNote(slug: string): Promise<void> {
	await db.delete(accountNotes).where(eq(accountNotes.slug, slug));

	logInfo("deleteNote", "Note deleted", { noteSlug: slug });
}
