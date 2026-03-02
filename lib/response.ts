/**
 * lib/response.ts
 * Standardized API response wrapper for consistent response formatting.
 */

import { NextResponse } from 'next/server';
import { getRequestId } from './requestContext';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  requestId: string;
  timestamp: string;
}

export class ResponseBuilder {
  /**
   * Build a success response
   */
  static success<T>(data: T, statusCode: number = 200): NextResponse<ApiResponse<T>> {
    return NextResponse.json<ApiResponse<T>>(
      {
        success: true,
        data,
        requestId: getRequestId(),
        timestamp: new Date().toISOString(),
      },
      { status: statusCode }
    );
  }

  /**
   * Build an error response
   */
  static error(
    message: string,
    statusCode: number = 400,
    code?: string
  ): NextResponse<ApiResponse> {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: message,
        ...(code && { code }),
        requestId: getRequestId(),
        timestamp: new Date().toISOString(),
      },
      { status: statusCode }
    );
  }

  /**
   * Build a paginated response
   */
  static paginated<T>(data: T[], total: number, page: number, pageSize: number): ApiResponse<{
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    return {
      success: true,
      data: {
        items: data,
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      },
      requestId: getRequestId(),
      timestamp: new Date().toISOString(),
    };
  }
}
