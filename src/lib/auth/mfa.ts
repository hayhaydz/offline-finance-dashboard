import * as otplibPackage from 'otplib';
const authenticator = otplibPackage.authenticator;
import QRCode from 'qrcode';
import crypto from 'crypto';

// Generate TOTP secret for user (base32 encoded)
export function generateTOTPSecret(): string {
	return authenticator.generateSecret();
}

// Generate otpauth:// URL for QR code
export function generateOTPAuthURL(
	secret: string,
	username: string,
	appName: string = 'Offline Finance Dashboard'
): string {
	return authenticator.keyuri(username, appName, secret);
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
export function verifyTOTP(token: string, secret: string): boolean {
	return authenticator.verify({
		token,
		secret,
		window: 1
	});
}

// Generate 10 backup codes (8-character alphanumeric)
export function generateBackupCodes(): string[] {
	const codes: string[] = [];
	for (let i = 0; i < 10; i++) {
		codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
	}
	return codes;
}

// Decrypt TOTP secret that was encrypted with AES-256-GCM
// Used for MFA setup QR code generation and login verification
export function decryptTOTPSecret(
	encryptedSecret: string,
	iv: string,
	systemKey: string
): string {
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
