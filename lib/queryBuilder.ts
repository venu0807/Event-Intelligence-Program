/**
 * lib/queryBuilder.ts
 * Advanced query builder for assessments with filtering, sorting, and pagination.
 * Type-safe and resistant to SQL injection via parameterized queries.
 */

import db from './db';
import { RowDataPacket } from 'mysql2';

export interface AssessmentQuery {
  userId: number;
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'score' | 'impact';
  sortOrder?: 'asc' | 'desc';
  minScore?: number;
  maxScore?: number;
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  dominantCategory?:
    | 'Geopolitical'
    | 'Monetary'
    | 'Commodity'
    | 'SupplyChain'
    | 'General';
  search?: string; // search in title/description
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

class QueryBuilder {
  /**
   * Build a WHERE clause with type-safe parameters
   */
  private buildWhereClause(
    query: Omit<AssessmentQuery, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>
  ): { clause: string; params: (string | number)[] } {
    const conditions: string[] = ['ia.triggered_by = ?'];
    const params: (string | number)[] = [query.userId];

    if (query.minScore !== undefined) {
      conditions.push('ia.overall_score >= ?');
      params.push(query.minScore);
    }

    if (query.maxScore !== undefined) {
      conditions.push('ia.overall_score <= ?');
      params.push(query.maxScore);
    }

    if (query.impactLevel) {
      conditions.push('ia.impact_level = ?');
      params.push(query.impactLevel);
    }

    if (query.dominantCategory) {
      conditions.push('ia.dominant_category = ?');
      params.push(query.dominantCategory);
    }

    if (query.search) {
      // Search in assessment summary or event titles
      conditions.push(
        '(ia.ai_summary LIKE ? OR e.title LIKE ? OR e.description LIKE ?)'
      );
      const searchTerm = `%${query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    return { clause: conditions.join(' AND '), params };
  }

  /**
   * Get paginated assessments matching the query
   */
  async find(
    query: AssessmentQuery
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;
    const sortBy = query.sortBy ?? 'date';
    const sortOrder = (query.sortOrder ?? 'desc').toUpperCase();

    const sortMap = {
      date: 'ia.created_at',
      score: 'ia.overall_score',
      impact: 'CASE ia.impact_level WHEN "HIGH" THEN 3 WHEN "MEDIUM" THEN 2 ELSE 1 END',
    };

    const { clause, params } = this.buildWhereClause(query);

    // Count total matching records
    const countSql = query.search
      ? `
        SELECT COUNT(DISTINCT ia.id) as total
        FROM impact_assessments ia
        LEFT JOIN assessment_events ae ON ia.id = ae.assessment_id
        LEFT JOIN events e ON ae.event_id = e.id
        WHERE ${clause}
      `
      : `
        SELECT COUNT(*) as total
        FROM impact_assessments ia
        WHERE ${clause}
      `;

    const [countResult] = await db.query<RowDataPacket[]>(countSql, params);
    const total = (countResult[0]?.total as number) || 0;

    // Fetch paginated results
    const dataSql = query.search
      ? `
        SELECT DISTINCT
          ia.id,
          ia.overall_score,
          ia.impact_level,
          ia.dominant_category,
          ia.category_breakdown,
          ia.article_count,
          LEFT(ia.ai_summary, 300) as ai_summary_preview,
          DATE_FORMAT(ia.created_at, '%Y-%m-%dT%H:%i:%sZ') as created_at
        FROM impact_assessments ia
        LEFT JOIN assessment_events ae ON ia.id = ae.assessment_id
        LEFT JOIN events e ON ae.event_id = e.id
        WHERE ${clause}
        ORDER BY ${sortMap[sortBy]} ${sortOrder}
        LIMIT ? OFFSET ?
      `
      : `
        SELECT
          ia.id,
          ia.overall_score,
          ia.impact_level,
          ia.dominant_category,
          ia.category_breakdown,
          ia.article_count,
          LEFT(ia.ai_summary, 300) as ai_summary_preview,
          DATE_FORMAT(ia.created_at, '%Y-%m-%dT%H:%i:%sZ') as created_at
        FROM impact_assessments ia
        WHERE ${clause}
        ORDER BY ${sortMap[sortBy]} ${sortOrder}
        LIMIT ? OFFSET ?
      `;

    const [rows] = await db.query<RowDataPacket[]>(
      dataSql,
      [...params, limit, offset]
    );

    return {
      data: rows as Record<string, unknown>[],
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      hasMore: offset + limit < total,
    };
  }
}

export const queryBuilder = new QueryBuilder();
