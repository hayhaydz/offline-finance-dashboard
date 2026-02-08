import { generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { logError } from '$lib/utils/logger';

// Generate TOTP secret for user (base32 encoded)
export function generateTOTPSecret(): string {
	return generateSecret();
}

// Generate otpauth:// URL for QR code
export function generateOTPAuthURL(
	secret: string,
	username: string,
	appName: string = 'Offline Finance Dashboard'
): string {
	return generateURI({
		secret,
		label: username,
		issuer: appName
	});
}

// Generate QR code as data URL (base64 image)
export async function generateQRCode(url: string): Promise<string> {
	return await QRCode.toDataURL(url, {
		width: 300,
		margin: 2,
		color: {
			dark: '#000000',
			light: '#FFFFFF'
		}
	});
}

// Verify TOTP code (accept codes within 1 window = ~30 seconds for clock skew)
export async function verifyTOTP(token: string, secret: string): Promise<boolean> {
	try {
		const result = await verify({
			token,
			secret,
			epochTolerance: 30
		});
		return result.valid;
	} catch (error) {
		// If otplib throws (e.g., TokenLengthError), treat as invalid token
		// Log for debugging to identify token format issues
		logError('mfa', 'TOTP verification error (invalid token format)', error);
		return false;
	}
}

// Generate 10 backup codes (8-character alphanumeric)
export function generateBackupCodes(): string[] {
	const codes: string[] = [];
	for (let i = 0; i < 10; i++) {
		codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
	}
	return codes;
}

// Encrypt TOTP secret with AES-256-GCM (or PLAIN: prefix in loose mode)
// Used for storing TOTP secrets during registration
export function encryptTOTPSecret(
	secret: string,
	systemKey?: string
): { encrypted: string; iv: string } {
	// Loose mode: if no system key and not production, store with PLAIN: prefix
	const appEnv = process.env.APP_ENV;
	if (!systemKey && appEnv !== 'production') {
		return {
			encrypted: 'PLAIN:' + secret,
			iv: '00000000000000000000000000000000'
		};
	}

	// Production or key available: use proper encryption
	if (!systemKey) {
		throw new Error('ENCRYPTION_KEY is required in production environment');
	}

	const iv = crypto.randomBytes(16);
	const encryptionKey = crypto.createHash('sha256').update(systemKey).digest();
	const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

	let encrypted = cipher.update(secret, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	const authTag = cipher.getAuthTag();

	return {
		encrypted: encrypted + ':' + authTag.toString('hex'),
		iv: iv.toString('hex')
	};
}

// Decrypt TOTP secret that was encrypted with AES-256-GCM (or PLAIN: prefix)
// Used for MFA setup QR code generation and login verification
export function decryptTOTPSecret(
	encryptedSecret: string,
	iv: string,
	systemKey?: string
): string {
	const appEnv = process.env.APP_ENV;

	// Handle PLAIN: prefix (loose mode)
	if (encryptedSecret.startsWith('PLAIN:')) {
		if (appEnv === 'production') {
			throw new Error('SECURITY CRITICAL: Unencrypted secret detected in production environment');
		}
		return encryptedSecret.substring(6);
	}

	// Proper decryption required
	if (!systemKey) {
		throw new Error('ENCRYPTION_KEY required to decrypt encrypted secret');
	}

	const encryptionKey = crypto.createHash('sha256').update(systemKey).digest();
	const ivBuffer = Buffer.from(iv, 'hex');
	const parts = encryptedSecret.split(':');
	const ciphertext = parts[0];
	const authTag = Buffer.from(parts[1], 'hex');

	const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, ivBuffer);
	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
}

// Verify backup code against hashed codes from database
// Backup codes are case-insensitive for user convenience
// Returns the matching hash if valid, null otherwise
export async function verifyBackupCode(
	inputCode: string,
	hashedCodes: string[]
): Promise<string | null> {
	// Normalize to uppercase (backup codes are stored uppercase)
	const normalizedCode = inputCode.toUpperCase();

	// Import verifyPassword function from password module
	const { verifyPassword } = await import('$lib/auth/password');

	// Check against each hashed code
	// We use the same Argon2id verification as password hashing
	for (const hash of hashedCodes) {
		const isValid = await verifyPassword(hash, normalizedCode);
		if (isValid) {
			return hash;
		}
	}

	return null;
}
