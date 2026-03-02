/**
 * lib/auditLog.ts
 * Audit trail for sensitive operations: auth, analysis, etc.
 * Writes to console/file and can be integrated with external audit platforms.
 */

import { logger } from './logger';

export type AuditAction =
  | 'USER_REGISTER'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'ANALYSIS_STARTED'
  | 'ANALYSIS_COMPLETED'
  | 'ASSESSMENT_VIEWED'
  | 'ASSESSMENT_DELETED'
  | 'AUTH_FAILED'
  | 'PERMISSION_DENIED';

interface AuditLogEntry {
  action: AuditAction;
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  status: 'success' | 'failure';
  details?: Record<string, unknown>;
  timestamp: string;
}

class AuditLogger {
  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    logger.info(`[AUDIT] ${entry.action}`, {
      action: entry.action,
      userId: entry.userId,
      ip: entry.ipAddress,
      resource: entry.resource,
      status: entry.status,
      details: entry.details,
    });

    /**
     * TODO: Send to external audit system (Datadog, Splunk, etc)
     * Example:
     *   if (process.env.AUDIT_ENDPOINT) {
     *     fetch(process.env.AUDIT_ENDPOINT, { method: 'POST', body: JSON.stringify(logEntry) })
     *   }
     */
  }

  register(userId: number, email: string, ipAddress?: string) {
    this.log({
      action: 'USER_REGISTER',
      userId,
      ipAddress,
      resource: `user:${userId}`,
      status: 'success',
      details: { email },
    });
  }

  login(userId: number, email: string, ipAddress?: string) {
    this.log({
      action: 'USER_LOGIN',
      userId,
      ipAddress,
      resource: `user:${userId}`,
      status: 'success',
      details: { email },
    });
  }

  loginFailed(email: string, ipAddress?: string, reason?: string) {
    this.log({
      action: 'AUTH_FAILED',
      ipAddress,
      resource: `auth:login`,
      status: 'failure',
      details: { email, reason },
    });
  }

  analysisStarted(userId: number, ipAddress?: string) {
    this.log({
      action: 'ANALYSIS_STARTED',
      userId,
      ipAddress,
      resource: `analysis:run`,
      status: 'success',
    });
  }

  analysisCompleted(
    userId: number,
    assessmentId: number,
    score: number,
    ipAddress?: string
  ) {
    this.log({
      action: 'ANALYSIS_COMPLETED',
      userId,
      ipAddress,
      resource: `assessment:${assessmentId}`,
      status: 'success',
      details: { assessmentId, score },
    });
  }

  permissionDenied(userId: number | undefined, resource: string, ipAddress?: string) {
    this.log({
      action: 'PERMISSION_DENIED',
      userId,
      ipAddress,
      resource,
      status: 'failure',
    });
  }
}

export const auditLog = new AuditLogger();
