/**
 * lib/requestContext.ts
 * Request context tracking for observability and correlation.
 * Useful for tracing requests across multiple services and logs.
 */

import { headers } from 'next/headers';

interface RequestContext {
  requestId: string;
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
  timestamp: number;
}

let currentContext: RequestContext | null = null;

/**
 * Initialize request context (call at the start of each request)
 */
export async function initRequestContext(userId?: number): Promise<RequestContext> {
  const hdrs = await headers();

  // Prefer X-Request-ID header if provided (for distributed tracing)
  const requestId =
    hdrs.get('X-Request-ID') ||
    hdrs.get('x-request-id') ||
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const context: RequestContext = {
    requestId,
    userId,
    ipAddress:
      hdrs.get('X-Forwarded-For')?.split(',')[0].trim() ||
      hdrs.get('X-Real-IP') ||
      'unknown',
    userAgent: hdrs.get('User-Agent') || 'unknown',
    timestamp: Date.now(),
  };

  currentContext = context;
  return context;
}

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | null {
  return currentContext;
}

/**
 * Update user ID in current context
 */
export function updateRequestContext(userId?: number): void {
  if (currentContext) {
    currentContext.userId = userId;
  }
}

/**
 * Clear the current context (call at end of request)
 */
export function clearRequestContext(): void {
  currentContext = null;
}

/**
 * Get request ID for correlation in logs
 */
export function getRequestId(): string {
  return currentContext?.requestId || 'unknown';
}
