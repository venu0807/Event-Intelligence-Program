/**
 * lib/errors.ts
 * Custom error types and handlers for the application.
 * Enables type-safe error handling and consistent error responses.
 */

import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super('AUTH_REQUIRED', 401, message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super('PERMISSION_DENIED', 403, message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super('NOT_FOUND', 404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', 409, message, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(public resetIn: number) {
    super('RATE_LIMITED', 429, 'Rate limit exceeded', { resetIn });
    this.name = 'RateLimitError';
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', error?: Error) {
    super('INTERNAL_ERROR', 500, message);
    this.name = 'InternalError';
    if (error) logger.error('Internal error', error);
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Convert any error to an appropriate response
 */
export function errorToResponse(err: unknown): {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  statusCode: number;
} {
  if (isAppError(err)) {
    return {
      error: err.message,
      code: err.code,
      ...(err.details && { details: err.details }),
      statusCode: err.statusCode,
    };
  }

  if (err instanceof Error) {
    logger.error('Unhandled error', err);
    return {
      error: 'Internal server error',
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
    };
  }

  logger.error('Unhandled non-error', { error: String(err) });
  return {
    error: 'Internal server error',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
  };
}
