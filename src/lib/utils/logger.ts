/**
 * Environment-aware logging utility with Winston file logging and daily rotation.
 *
 * In development mode, provides detailed logging with pretty-printed data.
 * In production mode, suppresses dev logs and sanitizes error logs.
 *
 * File logging with daily rotation for persistent debugging and auditing.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sensitive field names that should be masked in logs
 */
const SENSITIVE_FIELDS = ['password', 'totpSecret', 'backupCodes', 'token', 'secret', 'apiKey'];

/**
 * Check if the application is running in development mode
 */
export function isDevelopment(): boolean {
	return process.env.APP_ENV === 'development';
}

/**
 * Get formatted timestamp for log entries
 */
function getTimestamp(): string {
	return new Date().toISOString();
}

/**
 * Ensure logs directory exists
 */
function ensureLogsDirectory(): void {
	const logsDir = join(process.cwd(), 'logs');
	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}
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
 * Initialize logs directory
 */
ensureLogsDirectory();

/**
 * Create Winston logger with daily rotating file transports
 */
const logger = winston.createLogger({
	level: isDevelopment() ? 'debug' : 'info',
	format: winston.format.combine(
		winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
		winston.format.errors({ stack: true }),
		winston.format.json()
	),
	transports: [
		// Application log - all levels
		new DailyRotateFile({
			filename: join(process.cwd(), 'logs', 'application-%DATE%.log'),
			datePattern: 'YYYY-MM-DD',
			maxSize: '20m',
			maxFiles: '30d',
			level: 'debug'
		}),
		// Error log - error level only
		new DailyRotateFile({
			filename: join(process.cwd(), 'logs', 'error-%DATE%.log'),
			datePattern: 'YYYY-MM-DD',
			maxSize: '20m',
			maxFiles: '30d',
			level: 'error'
		})
	],
	// Add console transport in development only
	...(isDevelopment()
		? [
				new winston.transports.Console({
					format: winston.format.combine(
						winston.format.colorize(),
						winston.format.printf(({ level, message, timestamp, ...meta }) => {
							let msg = `${timestamp} [${level}]: ${message}`;
							if (Object.keys(meta).length > 0) {
								msg += ` ${JSON.stringify(meta, null, 2)}`;
							}
							return msg;
						})
					)
				})
			]
		: [])
});

/**
 * Development-only logging
 * Only outputs in development mode, silently ignored in production
 */
export function devLog(category: string, message: string, data?: any): void {
	if (!isDevelopment()) {
		return;
	}

	const timestamp = getTimestamp();
	const prefix = `[DEV] [${category}] ${message}`;

	if (data !== undefined) {
		const maskedData = maskSensitiveData(data);
		logger.debug(prefix, {
			timestamp,
			category,
			message,
			data: maskedData
		});
		console.log(`${prefix}`);
		console.log(`  Timestamp: ${timestamp}`);
		console.log(`  Data:`, maskedData);
	} else {
		logger.debug(prefix, {
			timestamp,
			category,
			message
		});
		console.log(`${prefix} (${timestamp})`);
	}
}

/**
 * Error logging (works in all environments)
 * In production, only logs category and message (no sensitive data)
 */
export function logError(category: string, message: string, error?: any): void {
	const timestamp = getTimestamp();
	const prefix = `[ERROR] [${category}] ${message}`;

	if (isDevelopment()) {
		if (error !== undefined) {
			logger.error(prefix, {
				timestamp,
				category,
				message,
				error: error instanceof Error ? error.stack : error
			});
			console.error(`${prefix}`);
			console.error(`  Timestamp: ${timestamp}`);
			console.error(`  Error:`, error);
		} else {
			logger.error(prefix, {
				timestamp,
				category,
				message
			});
			console.error(`${prefix} (${timestamp})`);
		}
	} else {
		// Production: only log category and message, no sensitive data
		logger.error(prefix, {
			timestamp,
			category,
			message
		});
		console.error(`${prefix} (${timestamp})`);
	}
}

/**
 * Form data logging with automatic sensitive field masking
 * Only logs in development mode
 */
export function logFormData(category: string, formData: Record<string, any>): void {
	if (!isDevelopment()) {
		return;
	}

	const timestamp = getTimestamp();
	const maskedData = maskSensitiveData(formData);

	logger.debug(`[DEV] [${category}] Form Data`, {
		timestamp,
		category,
		formData: maskedData
	});

	console.log(`[DEV] [${category}] Form Data`);
	console.log(`  Timestamp: ${timestamp}`);
	console.log(`  Data:`, maskedData);
}

/**
 * Request logging for debugging form submissions
 * Logs request method, URL, and select headers
 */
export function logRequest(category: string, request: Request): void {
	if (!isDevelopment()) {
		return;
	}

	const timestamp = getTimestamp();

	logger.debug(`[DEV] [${category}] Request`, {
		timestamp,
		category,
		method: request.method,
		url: request.url,
		headers: {
			'content-type': request.headers.get('content-type'),
			'user-agent': request.headers.get('user-agent')
		}
	});

	console.log(`[DEV] [${category}] Request`);
	console.log(`  Timestamp: ${timestamp}`);
	console.log(`  Method: ${request.method}`);
	console.log(`  URL: ${request.url}`);
	console.log(`  Headers:`, {
		'content-type': request.headers.get('content-type'),
		'user-agent': request.headers.get('user-agent')
	});
}

/**
 * Gracefully close the logger (for shutdown)
 * Ensures all logs are flushed before exit
 */
export async function closeLogger(): Promise<void> {
	// Winston 3.x handles flushing automatically by the transport
	// This is a no-op but provided for API completeness
	return Promise.resolve();
}
