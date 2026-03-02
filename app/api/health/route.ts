/**
 * app/api/health/route.ts
 * Health check endpoint for Kubernetes/Docker/monitoring systems.
 * Returns 200 if healthy, 503 if degraded/unhealthy.
 */

import { NextResponse } from 'next/server';
import { healthChecker } from '@/lib/health';

export async function GET() {
  const health = await healthChecker.check();

  const status = health.status === 'healthy' ? 200 : 503;

  return NextResponse.json(health, { status });
}
