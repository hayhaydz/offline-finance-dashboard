import crypto from 'crypto';

// Derive encryption key from user password using PBKDF2
// Returns 256-bit key for AES-256-GCM
export function deriveKeyFromPassword(password: string, salt: string): Buffer {
	return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
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
