/**
 * app/api/assessments/advanced/route.ts
 * Advanced assessments endpoint with filtering, searching, and pagination.
 * Supports: score ranges, impact levels, categories, text search, sorting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { queryBuilder } from '@/lib/queryBuilder';
import { globalLimiter } from '@/lib/rateLimiter';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  // Rate limit by user ID
  const limiterKey = `user:${user.userId}`;
  const { allowed, remaining, resetIn } = globalLimiter.check(limiterKey);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) },
      }
    );
  }

  try {
    const { searchParams } = new URL(req.url);

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);
    const sortBy = (searchParams.get('sortBy') as 'date' | 'score' | 'impact') ?? 'date';
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'desc';
    const minScore = searchParams.get('minScore')
      ? parseInt(searchParams.get('minScore')!, 10)
      : undefined;
    const maxScore = searchParams.get('maxScore')
      ? parseInt(searchParams.get('maxScore')!, 10)
      : undefined;
    const impactLevel = searchParams.get('impactLevel') as
      | 'LOW'
      | 'MEDIUM'
      | 'HIGH'
      | null;
    const dominantCategory = searchParams.get('dominantCategory') as
      | 'Geopolitical'
      | 'Monetary'
      | 'Commodity'
      | 'SupplyChain'
      | 'General'
      | null;
    const search = searchParams.get('search') ?? undefined;

    const result = await queryBuilder.find({
      userId: user.userId,
      limit,
      offset,
      sortBy,
      sortOrder,
      minScore,
      maxScore,
      impactLevel: impactLevel || undefined,
      dominantCategory: dominantCategory || undefined,
      search,
    });

    logger.info('Advanced assessment query', {
      userId: user.userId,
      resultCount: result.data.length,
      total: result.total,
      filters: {
        minScore,
        maxScore,
        impactLevel,
        dominantCategory,
        search: !!search,
      },
    });

    return NextResponse.json(result, {
      headers: {
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch (err) {
    logger.error('Advanced assessment query failed', err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
