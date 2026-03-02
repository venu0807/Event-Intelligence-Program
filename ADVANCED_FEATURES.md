# Advanced Features & Architecture

This document describes the advanced, production-ready features added to the Event Intelligence Platform.

---

## 1. Structured Logging (`lib/logger.ts`)

**Purpose:** JSON-formatted, structured logging for observability and centralized log aggregation.

**Features:**
- Log levels: `debug`, `info`, `warn`, `error`, `fatal`
- Contextual information and error stack traces
- Configurable minimum log level via `LOG_LEVEL` environment variable

**Usage:**
```typescript
import { logger } from '@/lib/logger';

logger.info('User login', { userId: 123, email: 'user@example.com' });
logger.error('Database error', error);
```

**Integration:** Easily integrated with:
- Datadog
- New Relic
- CloudWatch
- ELK Stack
- Splunk

---

## 2. Rate Limiting (`lib/rateLimiter.ts`)

**Purpose:** Prevent abuse and ensure fair resource allocation.

**Features:**
- Token bucket algorithm (allows burst traffic)
- Configurable max tokens and refill rate
- Pre-configured limiters: `globalLimiter`, `authLimiter`, `apiLimiter`
- Automatic cleanup of stale buckets

**Defaults:**
- **Global API**: 600 requests/minute per IP
- **Auth endpoints**: 10 requests/minute per IP
- **General API**: 1000 requests/minute per IP

**Usage:**
```typescript
import { authLimiter } from '@/lib/rateLimiter';

const { allowed, remaining, resetIn } = authLimiter.check(ipAddress);
if (!allowed) {
  return NextResponse.json(
    { error: 'Rate limited' },
    { status: 429, headers: { 'Retry-After': String(resetIn/1000) } }
  );
}
```

---

## 3. Audit Logging (`lib/auditLog.ts`)

**Purpose:** Track sensitive operations for compliance and security.

**Tracked Actions:**
- User registration, login, logout
- Analysis runs and completions
- Permission violations
- Failed authentication attempts

**Usage:**
```typescript
import { auditLog } from '@/lib/auditLog';

auditLog.login(userId, email, ipAddress);
auditLog.analysisCompleted(userId, assessmentId, score, ipAddress);
```

**Integration:** Can send audit logs to:
- Splunk
- Datadog
- ElasticSearch
- Custom audit platforms

---

## 4. Health Checks (`lib/health.ts` + `/api/health`)

**Purpose:** Monitor application status for Kubernetes, Docker, and monitoring systems.

**Checks:**
- Database connectivity
- Memory usage (warning/critical thresholds)
- Application uptime

**Endpoints:**
- `GET /api/health` → Returns health status, returns HTTP 200 if healthy, 503 if degraded/unhealthy

**Response Example:**
```json
{
  "status": "healthy",
  "uptime": 3600000,
  "timestamp": "2026-03-02T10:30:00Z",
  "checks": {
    "database": "ok",
    "memory": "ok"
  }
}
```

---

## 5. Advanced Query Builder (`lib/queryBuilder.ts`)

**Purpose:** Type-safe, SQL-injection-resistant advanced search and filtering for assessments.

**Supported Filters:**
- Score range (min/max)
- Impact level
- Dominant category
- Full-text search in summaries and titles
- Pagination with sorting

**Endpoint:** `GET /api/assessments/advanced`

**Query Parameters:**
```
?limit=20&offset=0
&sortBy=date|score|impact
&sortOrder=asc|desc
&minScore=50&maxScore=100
&impactLevel=HIGH|MEDIUM|LOW
&dominantCategory=Geopolitical|Monetary|...
&search=keyword
```

**Response:**
```json
{
  "data": [...assessments],
  "total": 150,
  "page": 1,
  "pageSize": 20,
  "hasMore": true
}
```

---

## 6. Error Handling (`lib/errors.ts`)

**Purpose:** Type-safe, consistent error handling across the application.

**Custom Error Types:**
- `ValidationError` (400)
- `AuthenticationError` (401)
- `AuthorizationError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `RateLimitError` (429)
- `InternalError` (500)

**Usage:**
```typescript
import { ValidationError, AuthenticationError } from '@/lib/errors';

if (!user) throw new AuthenticationError('Invalid credentials');
if (email.includes('@')) throw new ValidationError('Invalid email');
```

---

## 7. Request Context (`lib/requestContext.ts`)

**Purpose:** Track request metadata for correlation and observability.

**Captures:**
- Request ID (for distributed tracing)
- User ID
- IP address
- User-Agent
- Timestamp

**Usage:**
```typescript
import { initRequestContext, getRequestId } from '@/lib/requestContext';

// At start of request
await initRequestContext(userId);

// In logs
const reqId = getRequestId(); // use for correlation
```

---

## 8. Metrics Collection (`lib/metrics.ts` + `/api/metrics`)

**Purpose:** Track application performance metrics for monitoring.

**Metric Types:**
- Counters (increment-only)
- Timers (duration tracking)

**Pre-defined Metrics:**
- `api.requests.total` - Total API requests
- `api.request.duration_ms` - Request latency
- `api.errors.total` - Error count
- `db.query.duration_ms` - Database query performance
- `auth.login.attempts` - Login attempts
- `analysis.duration_ms` - Analysis execution time

**Endpoint:** `GET /api/metrics` (development only)

**Usage:**
```typescript
import { metrics, METRIC_NAMES } from '@/lib/metrics';

metrics.increment(METRIC_NAMES.API_REQUEST_TOTAL);
await metrics.timeAsync(METRIC_NAMES.DB_QUERY_DURATION, () => db.query(...));
```

---

## 9. In-Memory Caching (`lib/cache.ts`)

**Purpose:** Reduce database load and improve response times.

**Features:**
- TTL-based expiration
- Pattern-based invalidation
- Automatic cleanup of expired entries
- Pre-configured caches:
  - `assessmentCache` (5 min TTL)
  - `sessionCache` (7 day TTL)
  - `apiCache` (1 min TTL)

**Usage:**
```typescript
import { assessmentCache } from '@/lib/cache';

const cached = assessmentCache.get(`user:${userId}:assessment:${id}`);
if (cached) return cached;

const data = await fetchFromDB();
assessmentCache.set(`user:${userId}:assessment:${id}`, data, 300);
return data;
```

---

## 10. Standardized API Responses (`lib/response.ts`)

**Purpose:** Consistent response formatting across all endpoints.

**Response Format:**
```json
{
  "success": true,
  "data": {...},
  "requestId": "abc123",
  "timestamp": "2026-03-02T10:30:00Z"
}
```

**Usage:**
```typescript
import { ResponseBuilder } from '@/lib/response';

return ResponseBuilder.success(data, 200);
return ResponseBuilder.error('Not found', 404, 'RESOURCE_NOT_FOUND');
```

---

## Integration Examples

### Example 1: Protected Analysis with Rate Limiting & Audit Logging

```typescript
import { auditLog } from '@/lib/auditLog';
import { authLimiter } from '@/lib/rateLimiter';
import { initRequestContext } from '@/lib/requestContext';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  await initRequestContext(user?.userId);

  const ipAddress = req.headers.get('X-Forwarded-For') || 'unknown';
  const { allowed, resetIn } = authLimiter.check(ipAddress);

  if (!allowed) {
    auditLog.permissionDenied(user?.userId, 'analysis:post', ipAddress);
    return ResponseBuilder.error('Rate limited', 429);
  }

  logger.info('Analysis started', { userId: user.userId });
  auditLog.analysisStarted(user.userId, ipAddress);

  // ... run analysis ...

  auditLog.analysisCompleted(user.userId, assessmentId, score, ipAddress);
  logger.info('Analysis completed', { assessmentId, score });

  return ResponseBuilder.success({ assessmentId, score });
}
```

### Example 2: Cached Assessment Query with Advanced Search

```typescript
import { assessmentCache } from '@/lib/cache';
import { queryBuilder } from '@/lib/queryBuilder';
import { metrics, METRIC_NAMES } from '@/lib/metrics';

const cacheKey = `assessments:user:${userId}:${JSON.stringify(filters)}`;
const cached = assessmentCache.get(cacheKey);
if (cached) {
  metrics.increment(`${METRIC_NAMES.CACHE_HIT}`);
  return ResponseBuilder.success(cached);
}

metrics.increment(`${METRIC_NAMES.CACHE_MISS}`);
const result = await metrics.timeAsync(
  METRIC_NAMES.DB_QUERY_DURATION,
  () => queryBuilder.find({ userId, ...filters })
);

assessmentCache.set(cacheKey, result);
return ResponseBuilder.success(result);
```

---

## Deployment Checklist

- [ ] Set `LOG_LEVEL` environment variable (default: `info`)
- [ ] Configure rate limits based on expected traffic
- [ ] Set up log aggregation (Datadog, ELK, etc.)
- [ ] Enable audit logging to external system if needed
- [ ] Configure Kubernetes liveness probe → `/api/health`
- [ ] Protect `/api/metrics` endpoint with auth in production
- [ ] Monitor metrics dashboard
- [ ] Set up alerts on high error rates
- [ ] Configure cache TTLs based on workload
- [ ] Review and adjust rate limit thresholds

---

## Performance Considerations

| Feature | Overhead | Notes |
|---------|----------|-------|
| Logging | <1ms | Minimal; async in production |
| Rate limiting | <1ms | O(1) token bucket lookup |
| Audit logging | <1ms | Can be made async |
| Caching | <1ms | In-memory, negligible |
| Health checks | ~10ms | Database connectivity test |
| Query builder | Variable | Same as database query |

---

## Future Enhancements

1. **Redis Integration** - Replace in-memory caches with Redis for distributed systems
2. **Prometheus Export** - Format metrics for Prometheus scraping
3. **OpenTelemetry** - Distributed tracing with OTel integration
4. **Circuit Breaker** - Graceful degradation for external service failures
5. **Request Signing** - Cryptographic signature verification for API security
6. **Database Query Caching** - Query-level result caching with invalidation
7. **Cost Tracking** - Per-user/API cost accounting (for multi-tenant scenarios)

