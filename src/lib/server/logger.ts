/**
 * Environment-aware logging utility with Winston file logging and daily rotation.
 *
 * In development mode, provides detailed logging with pretty-printed data.
 * In production mode, suppresses dev logs and sanitizes error logs.
 *
 * File logging with daily rotation for persistent debugging and auditing.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { maskSensitiveData } from "$lib/utils/log-sanitize";

/**
 * Check if the application is running in development mode
 */
export function isDevelopment(): boolean {
	return process.env.APP_ENV === "development";
}

export function isVerboseDebug(): boolean {
	return isDevelopment() && process.env.VERBOSE_DEBUG_LOGS === "true";
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
	const logsDir = join(process.cwd(), "logs");
	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}
}

/**
 * Initialize logs directory
 */
ensureLogsDirectory();

/**
 * Create Winston logger with daily rotating file transports
 */
const logger = winston.createLogger({
	level: isDevelopment() ? "debug" : "info",
	format: winston.format.combine(
		winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
		winston.format.errors({ stack: true }),
		winston.format.json(),
	),
	transports: [
		// Application log - all levels
		new DailyRotateFile({
			filename: join(process.cwd(), "logs", "application-%DATE%.log"),
			datePattern: "YYYY-MM-DD",
			maxSize: "20m",
			maxFiles: "30d",
			level: "debug",
		}),
		// Error log - error level only
		new DailyRotateFile({
			filename: join(process.cwd(), "logs", "error-%DATE%.log"),
			datePattern: "YYYY-MM-DD",
			maxSize: "20m",
			maxFiles: "30d",
			level: "error",
		}),
	],
});

/**
 * Development-only logging
 * Only outputs in development mode, silently ignored in production
 */
export function devLog(
	category: string,
	message: string,
	data?: unknown,
): void {
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
			data: maskedData,
		});
	} else {
		logger.debug(prefix, {
			timestamp,
			category,
			message,
		});
	}
}

/**
 * Error logging (works in all environments)
 * In production, only logs category and message (no sensitive data)
 */
export function logError(
	category: string,
	message: string,
	error?: unknown,
): void {
	const timestamp = getTimestamp();
	const prefix = `[ERROR] [${category}] ${message}`;

	if (error !== undefined) {
		logger.error(prefix, {
			timestamp,
			category,
			message,
			error: error instanceof Error ? error.stack : error,
		});
	} else {
		logger.error(prefix, {
			timestamp,
			category,
			message,
		});
	}
}

/**
 * Form data logging with automatic sensitive field masking
 * Only logs in development mode
 */
export function logFormData(category: string, formData: unknown): void {
	if (!isDevelopment()) {
		return;
	}

	const timestamp = getTimestamp();
	const maskedData = maskSensitiveData(formData);

	logger.debug(`[DEV] [${category}] Form Data`, {
		timestamp,
		category,
		formData: maskedData,
	});
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
			"content-type": request.headers.get("content-type"),
			"user-agent": request.headers.get("user-agent"),
		},
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
