import crypto from 'crypto';

// OWASP-recommended parameters for 2025-2026 key derivation
const KDF_OPTIONS = {
	algorithm: 2, // argon2id
	memoryCost: 65536, // 64 MB
	timeCost: 3,
	parallelism: 1,
	outputLen: 32 // 32-byte (256-bit) key
};

/**
 * Derive encryption key from user password using PBKDF2.
 * Returns 256-bit key for AES-256-GCM.
 */
export async function deriveKeyFromPassword(password: string, salt: string): Promise<Buffer> {
	// Using PBKDF2 with a high iteration count (600,000 is the 2026 OWASP recommendation for HMAC-SHA256)
	// This provides strong protection against brute-force attacks while being compatible with standard key formats.
	return crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256');
}

// Encrypt user-specific data with user-derived key
// Returns encrypted data with IV and auth tag
export function encryptUserData(data: string, key: Buffer): { encrypted: string; iv: string } {
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

	let encrypted = cipher.update(data, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	const authTag = cipher.getAuthTag();

	return {
		encrypted: encrypted + authTag.toString('hex'),
		iv: iv.toString('hex')
	};
}

// Decrypt user-specific data with user-derived key
export function decryptUserData(encrypted: string, iv: string, key: Buffer): string {
	const ivBuffer = Buffer.from(iv, 'hex');
	const authTag = Buffer.from(encrypted.slice(-32), 'hex');
	const ciphertext = encrypted.slice(0, -32);

	const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
	decrypted += decipher.final('utf8');

	return decrypted;
}
