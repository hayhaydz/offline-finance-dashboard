/**
 * Client-side logging utility for browser debugging.
 *
 * Matches the API of the server-side logger (@see logger.ts)
 * but outputs to browser console instead of files.
 *
 * In development mode, provides detailed logging with pretty-printed data.
 * In production mode, suppresses dev logs and sanitizes error logs.
 */

/**
 * Sensitive field names that should be masked in logs
 */
const SENSITIVE_FIELDS = ['password', 'totpSecret', 'backupCodes', 'token', 'secret', 'apiKey'];

/**
 * Check if the application is running in development mode
 */
export function isDevelopmentClient(): boolean {
	return import.meta.env.DEV;
}

/**
 * Get formatted timestamp for log entries
 */
function getTimestamp(): string {
	return new Date().toISOString();
}

/**
 * Mask sensitive fields in an object
 */
function maskSensitiveData(data: any): any {
	if (!data || typeof data !== 'object') {
		return data;
	}

	if (Array.isArray(data)) {
		return data.map((item) => maskSensitiveData(item));
	}

	const masked: Record<string, any> = {};
	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();
		const isSensitive = SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()));

		if (isSensitive) {
			masked[key] = '[REDACTED]';
		} else if (typeof value === 'object' && value !== null) {
			masked[key] = maskSensitiveData(value);
		} else {
			masked[key] = value;
		}
	}

	return masked;
}

/**
 * Development-only logging
 * Only outputs in development mode, silently ignored in production
 */
export function devLogClient(category: string, message: string, data?: any): void {
	if (!isDevelopmentClient()) {
		return;
	}

	const timestamp = getTimestamp();
	const prefix = `%c[DEV] [${category}] ${message}`;
	const style = 'color: #0066cc; font-weight: bold;';

	if (data !== undefined) {
		const maskedData = maskSensitiveData(data);
		console.log(prefix, style);
		console.log(`  Timestamp: ${timestamp}`);
		console.log('  Data:', maskedData);
	} else {
		console.log(`${prefix} (${timestamp})`, style);
	}
}

/**
 * Error logging (works in all environments)
 * In production, only logs category and message (no data)
 */
export function logErrorClient(category: string, message: string, error?: any): void {
	const timestamp = getTimestamp();
	const prefix = `%c[ERROR] [${category}] ${message}`;
	const style = 'color: #cc0000; font-weight: bold;';

	if (isDevelopmentClient()) {
		if (error !== undefined) {
			console.error(prefix, style);
			console.error(`  Timestamp: ${timestamp}`);
			console.error('  Error:', error);
		} else {
			console.error(`${prefix} (${timestamp})`, style);
		}
	} else {
		// Production: only log category and message, no sensitive data
		console.error(`${prefix} (${timestamp})`, style);
	}
}

/**
 * Form data logging with automatic sensitive field masking
 * Only logs in development mode
 */
export function logFormDataClient(category: string, formData: Record<string, any>): void {
	if (!isDevelopmentClient()) {
		return;
	}

	const timestamp = getTimestamp();
	const maskedData = maskSensitiveData(formData);

	console.log(`%c[DEV] [${category}] Form Data`, 'color: #0066cc; font-weight: bold;');
	console.log(`  Timestamp: ${timestamp}`);
	console.log('  Data:', maskedData);
}

/**
 * Validation state logging for debugging form validation
 * Only logs in development mode
 */
export function logValidationState(category: string, state: Record<string, any>): void {
	if (!isDevelopmentClient()) {
		return;
	}

	const timestamp = getTimestamp();
	console.log(`%c[DEV] [${category}] Validation State`, 'color: #0066cc; font-weight: bold;');
	console.log(`  Timestamp: ${timestamp}`);
	console.log('  State:', state);
}

/**
 * Component lifecycle logging
 * Only logs in development mode
 */
export function logComponentLifecycle(category: string, component: string, action: 'mount' | 'unmount' | 'update', data?: any): void {
	if (!isDevelopmentClient()) {
		return;
	}

	const timestamp = getTimestamp();
	console.log(`%c[DEV] [${category}] Component ${action}: ${component}`, 'color: #0066cc; font-weight: bold;');
	console.log(`  Timestamp: ${timestamp}`);
	if (data !== undefined) {
		console.log('  Data:', data);
	}
}

/**
 * Form submission logging
 * Only logs in development mode
 */
export function logFormSubmit(category: string, formName: string, data?: any): void {
	if (!isDevelopmentClient()) {
		return;
	}

	const timestamp = getTimestamp();
	console.log(`%c[DEV] [${category}] Form Submit: ${formName}`, 'color: #0066cc; font-weight: bold;');
	console.log(`  Timestamp: ${timestamp}`);
	if (data !== undefined) {
		const maskedData = maskSensitiveData(data);
		console.log('  Data:', maskedData);
	}
}
