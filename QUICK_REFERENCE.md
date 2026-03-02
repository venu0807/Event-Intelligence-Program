# Quick Reference Card

One-page reference for developers integrating advanced features.

---

## Imports Cheat Sheet

```typescript
// Logging
import { logger } from '@/lib/logger';
logger.info('msg', context);
logger.error('msg', error);

// Rate Limiting
import { globalLimiter, authLimiter, apiLimiter } from '@/lib/rateLimiter';
const { allowed, remaining, resetIn } = globalLimiter.check(key);

// Audit Logging
import { auditLog } from '@/lib/auditLog';
auditLog.login(userId, email, ip);
auditLog.analysisCompleted(userId, assessmentId, score, ip);

// Health Checks
import { healthChecker } from '@/lib/health';
const health = await healthChecker.check();

// Query Builder
import { queryBuilder } from '@/lib/queryBuilder';
const results = await queryBuilder.find({ userId, limit, offset, ... });

// Error Handling
import { ValidationError, AuthenticationError, errorToResponse } from '@/lib/errors';
throw new ValidationError('Invalid input');

// Request Context
import { initRequestContext, getRequestId, updateRequestContext } from '@/lib/requestContext';
await initRequestContext(userId);
const reqId = getRequestId();

// Metrics
import { metrics, METRIC_NAMES } from '@/lib/metrics';
metrics.increment(METRIC_NAMES.API_REQUEST_TOTAL);

// Caching
import { assessmentCache, sessionCache, apiCache } from '@/lib/cache';
const cached = assessmentCache.get(key);
assessmentCache.set(key, value, ttlSeconds);

// Responses
import { ResponseBuilder } from '@/lib/response';
return ResponseBuilder.success(data, 200);
return ResponseBuilder.error('msg', 400, 'CODE');
```

---

## Common Patterns

### Pattern 1: Protected Endpoint with Rate Limiting
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { globalLimiter } from '@/lib/rateLimiter';
import { ResponseBuilder } from '@/lib/response';

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return ResponseBuilder.error('Unauthorized', 401);

  const ip = req.headers.get('X-Forwarded-For') || 'unknown';
  const { allowed } = globalLimiter.check(ip);
  if (!allowed) return ResponseBuilder.error('Rate limited', 429);

  // ... implementation ...
  return ResponseBuilder.success(data);
}
```

### Pattern 2: Audit Logging + Metrics
```typescript
import { auditLog } from '@/lib/auditLog';
import { metrics, METRIC_NAMES } from '@/lib/metrics';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // ... do work ...
    
    metrics.recordTimer(METRIC_NAMES.ANALYSIS_DURATION, Date.now() - startTime);
    auditLog.analysisCompleted(userId, assessmentId, score, ip);
    logger.info('Analysis completed', { assessmentId, score });
    
    return ResponseBuilder.success({ assessmentId, score });
  } catch (err) {
    metrics.increment(METRIC_NAMES.API_ERROR_TOTAL);
    logger.error('Analysis failed', err instanceof Error ? err : new Error(String(err)));
    return ResponseBuilder.error('Analysis failed', 500);
  }
}
```

### Pattern 3: Cached Query with Invalidation
```typescript
import { assessmentCache } from '@/lib/cache';
import { metrics } from '@/lib/metrics';

export async function getWithCache(userId: number, id: number) {
  const key = `assessment:${userId}:${id}`;
  let assessment = assessmentCache.get(key);
  
  if (assessment) {
    metrics.increment('cache.hit');
    return assessment;
  }
  
  metrics.increment('cache.miss');
  assessment = await db.query('SELECT * FROM ...');
  assessmentCache.set(key, assessment, 300); // 5 min TTL
  
  return assessment;
}

export async function invalidateAssessmentCache(userId: number) {
  // Clear all assessment caches for user
  assessmentCache.deletePattern(new RegExp(`^assessment:${userId}:`));
}
```

### Pattern 4: Error Handling with Consistent Response
```typescript
import { ValidationError, ConflictError, errorToResponse } from '@/lib/errors';
import { ResponseBuilder } from '@/lib/response';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    
    if (!email?.includes('@')) {
      throw new ValidationError('Invalid email', { field: 'email' });
    }
    
    const existing = await findUser(email);
    if (existing) {
      throw new ConflictError('Email already registered', { email });
    }
    
    const user = await createUser(email, password);
    return ResponseBuilder.success(user, 201);
    
  } catch (err) {
    const response = errorToResponse(err);
    return ResponseBuilder.error(
      response.error,
      response.statusCode,
      response.code
    );
  }
}
```

### Pattern 5: Health-Aware Operations
```typescript
import { healthChecker } from '@/lib/health';
import { logger } from '@/lib/logger';

export async function analyzeWithHealthCheck(data: unknown) {
  const health = await healthChecker.check();
  
  if (health.status === 'unhealthy') {
    logger.error('Cannot proceed: system unhealthy', { health });
    throw new Error('System is unhealthy');
  }
  
  if (health.status === 'degraded') {
    logger.warn('Proceeding with degraded system', { health });
  }
  
  return await analyzeData(data);
}
```

---

## Environment Variables

```bash
# Required
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=event_intelligence
JWT_SECRET=<64-char-hex>
NEWS_API_KEY=<key>
GEMINI_API_KEY=<key>

# Optional (advanced features)
LOG_LEVEL=info  # debug|info|warn|error|fatal
NODE_ENV=production  # production|development|test
AUDIT_ENDPOINT=https://audit-system.example.com  # For external audit logs
```

---

## HTTP Headers

### Request Headers
```
X-Forwarded-For: 192.168.1.1      # Client IP (for rate limiting)
X-Request-ID: req_abc123          # Request correlation ID
User-Agent: Mozilla/5.0...        # Tracked for audit logs
Authorization: Bearer token       # If using token auth
```

### Response Headers
```
X-RateLimit-Remaining: 95         # After rate limit check
Retry-After: 60                   # If rate limited (seconds)
X-Request-ID: req_abc123          # Echoed from request or generated
```

---

## Rate Limit Defaults

```
Global API:    600 req/min per IP (10/sec)
Auth endpoints: 10 req/min per IP (~1 per 6 sec)
General API:  1000 req/min per IP (~17/sec)
Health:       unlimited
Metrics:      unlimited
```

---

## Metrics Names Reference

```typescript
// API
api.requests.total
api.request.duration_ms
api.errors.total

// Auth
auth.login.attempts
auth.login.success
auth.login.failure

// Database
db.query.duration_ms
db.connection.errors

// Analysis
analysis.started
analysis.completed
analysis.failed
analysis.duration_ms

// Cache
cache.hit
cache.miss
```

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {...},
  "requestId": "req_abc123",
  "timestamp": "2026-03-02T10:30:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Human message",
  "code": "ERROR_CODE",
  "details": {...},
  "requestId": "req_abc123",
  "timestamp": "2026-03-02T10:30:00Z"
}
```

---

## Debugging Commands

```bash
# Check health
curl http://localhost:3000/api/health | jq

# View metrics
curl http://localhost:3000/api/metrics | jq .metrics.counters

# Tail logs (if using file logging)
tail -f logs/app.log | grep "error"

# Check rate limiter state
curl -X POST http://localhost:3000/api/v1/ratelimit/status

# Database query timing (slow queries > 1 sec)
tail -f logs/mysql-slow.log
```

---

## Troubleshooting Quick Tips

| Issue | Solution |
|-------|----------|
| 429 Rate Limited | Check X-RateLimit-Remaining header, wait Retry-After seconds |
| 401 Unauthorized | Ensure session cookie is set, check JWT_SECRET |
| 503 Service Unavailable | Check /api/health, might be database down |
| High memory usage | Check cache TTLs, run health check, review heap usage |
| Slow queries | Check indexes, use EXPLAIN, review DB_QUERY_DURATION metric |

---

## Key Files to Review

| File | Purpose |
|------|---------|
| lib/logger.ts | Structured logging setup |
| lib/rateLimiter.ts | Rate limit configuration |
| lib/cache.ts | Cache TTLs and strategies |
| lib/errors.ts | Error type definitions |
| ADVANCED_FEATURES.md | Detailed feature guide |
| DEPLOYMENT.md | Production setup |
| DATABASE_OPTIMIZATION.md | Query optimization |
| API_REFERENCE.md | Complete API docs |

---

## Performance Targets

| Metric | Target | Keep Below |
|--------|--------|------------|
| Request latency p99 | <200ms | 500ms |
| DB query p99 | <100ms | 200ms |
| Cache hit rate | >70% | - |
| Error rate | <0.1% | 1% |
| Memory usage | <500MB | 1GB |
| Heap garbage collection | <100ms pause | 500ms |

---

## Security Checklist

- [ ] Rate limits configured
- [ ] Audit logging enabled
- [ ] Health checks secured
- [ ] Metrics endpoint protected in production
- [ ] JWT secret strong (64+ characters)
- [ ] Database password strong
- [ ] HTTPS/TLS enabled in production
- [ ] CORS properly configured
- [ ] Request validation in place
- [ ] Error messages don't leak sensitive info

---

