import { argon2id } from '@node-rs/argon2';

// OWASP-recommended parameters for 2025-2026
const HASH_OPTIONS = {
	memoryCost: 65536, // 64 MB (recommended range: 64-256 MB)
	timeCost: 3, // 3 iterations (OWASP minimum: 2)
	parallelism: 1, // 1 thread (baseline)
	outputLen: 32 // 32-byte output
};

export async function hashPassword(password: string): Promise<string> {
	return await argon2id.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	return await argon2id.verify(hash, password, HASH_OPTIONS);
}
