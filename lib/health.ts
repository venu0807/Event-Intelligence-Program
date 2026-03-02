/**
 * lib/health.ts
 * Health check utilities for liveness/readiness probes (Kubernetes, Docker, etc.)
 */

import db from './db';
import { logger } from './logger';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
    memory: 'ok' | 'warning' | 'critical';
  };
  errors?: string[];
}

class HealthChecker {
  private startTime = Date.now();

  async check(): Promise<HealthStatus> {
    const errors: string[] = [];

    // Check database connectivity
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      const conn = await db.getConnection();
      await conn.query('SELECT 1');
      conn.release();
    } catch (err) {
      dbStatus = 'error';
      errors.push(
        `Database error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    let memStatus: 'ok' | 'warning' | 'critical' = 'ok';
    if (heapUsedPercent > 90) {
      memStatus = 'critical';
      errors.push(`Heap usage at ${heapUsedPercent.toFixed(1)}%`);
    } else if (heapUsedPercent > 75) {
      memStatus = 'warning';
    }

    const uptime = Date.now() - this.startTime;

    const overallStatus =
      errors.length > 0
        ? dbStatus === 'error'
          ? 'unhealthy'
          : 'degraded'
        : 'healthy';

    return {
      status: overallStatus,
      uptime,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        memory: memStatus,
      },
      ...(errors.length > 0 && { errors }),
    };
  }
}

export const healthChecker = new HealthChecker();
