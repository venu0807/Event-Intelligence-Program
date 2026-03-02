/**
 * app/api/metrics/route.ts
 * Expose application metrics for monitoring/observability.
 * Can be scraped by Prometheus or queried by monitoring dashboards.
 *
 * NOTE: In production, protect this endpoint with authentication!
 */

import { NextResponse } from 'next/server';
import { metrics } from '@/lib/metrics';

export async function GET() {
  // TODO: In production, verify that the requester is authorized
  // For now, this is disabled in production via environment check
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Metrics endpoint disabled in production without auth' },
      { status: 403 }
    );
  }

  const metricsData = metrics.export();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    metrics: metricsData,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
}
