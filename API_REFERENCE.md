# API Reference Guide

Complete API reference for the Event Intelligence Platform including all endpoints and utilities.

---

## Authentication Endpoints

### POST /api/auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (201):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

**Error (409):**
```json
{
  "error": "An account with this email already exists."
}
```

**Validation:**
- Email must contain `@` and be ≤255 chars
- Password must be ≥8 chars
- Enforced rate limit: 10 requests/minute per IP

---

### POST /api/auth/login
Authenticate and receive session cookie.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

**Sets Cookie:**
```
eip_session=<JWT>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```

**Error (401):**
```json
{
  "error": "Invalid email or password."
}
```

**Rate Limit:** 10 requests/minute per IP

---

### DELETE /api/auth/login
Logout and clear session.

**Request:** `DELETE /api/auth/login`

**Response (200):**
```json
{
  "success": true
}
```

**Clears Cookie:** `eip_session=; Max-Age=0`

---

### GET /api/auth/me
Get current authenticated user.

**Request:** `GET /api/auth/me`

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

**Error (401):**
```json
{
  "error": "Unauthorized."
}
```

**Requires:** Valid session cookie

---

## Analysis Endpoints

### POST /api/analyze
Run a full analysis pipeline: fetch news → classify → AI summary → persist.

**Request:**
```
POST /api/analyze
Content-Type: application/json

(empty body)
```

**Response (200):**
```json
{
  "assessmentId": 42,
  "overallScore": 65,
  "impactLevel": "MEDIUM",
  "dominantCategory": "Geopolitical",
  "categoryBreakdown": {
    "Geopolitical": 45,
    "Monetary": 30,
    "Commodity": 15,
    "SupplyChain": 10,
    "General": 0
  },
  "articleCount": 20,
  "aiSummary": "Current macro indicators suggest...",
  "articles": [
    {
      "title": "War tensions escalate",
      "description": "...",
      "source": "Reuters",
      "url": "https://...",
      "publishedAt": "2026-03-02T10:00:00Z",
      "riskCategory": "Geopolitical",
      "articleScore": 78
    }
  ]
}
```

**Errors:**
```json
{
  "error": "NewsAPI returned no articles. Verify your NEWS_API_KEY and daily quota.",
  "status": 502
}
```

```json
{
  "error": "AI summary temporarily unavailable. The risk scoring above is unaffected.",
  "status": 200
}
```

**Duration:** 5-15 seconds (includes Gemini API call)

**Rate Limit:** 600 requests/minute per user globally

---

## Assessment Endpoints

### GET /api/assessments
Get user's assessment history (simple pagination).

**Request:**
```
GET /api/assessments?limit=10&offset=0
```

**Query Parameters:**
- `limit`: items per page (default: 10, max: 50)
- `offset`: pagination offset (default: 0)

**Response (200):**
```json
{
  "assessments": [
    {
      "id": 42,
      "overall_score": 65,
      "impact_level": "MEDIUM",
      "dominant_category": "Geopolitical",
      "category_breakdown": {...},
      "article_count": 20,
      "ai_summary_preview": "Current macro indicators suggest... (250 chars max)",
      "created_at": "2026-03-02T10:30:00Z"
    }
  ]
}
```

**Requires:** Authentication

---

### GET /api/assessments/advanced
Advanced search with filtering, sorting, and full-text search.

**Request:**
```
GET /api/assessments/advanced?
  limit=20&
  offset=0&
  sortBy=date&
  sortOrder=desc&
  minScore=50&
  maxScore=90&
  impactLevel=HIGH&
  dominantCategory=Geopolitical&
  search=oil%20war
```

**Query Parameters:**
- `limit`: 1-100 (default: 20)
- `offset`: pagination offset
- `sortBy`: `date` | `score` | `impact` (default: `date`)
- `sortOrder`: `asc` | `desc` (default: `desc`)
- `minScore`: 0-100 (optional)
- `maxScore`: 0-100 (optional)
- `impactLevel`: `LOW` | `MEDIUM` | `HIGH` (optional)
- `dominantCategory`: risk category (optional)
- `search`: full-text search in title/description (optional)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 42,
        "overall_score": 65,
        "impact_level": "MEDIUM",
        "dominant_category": "Geopolitical",
        "article_count": 20,
        "ai_summary_preview": "...",
        "created_at": "2026-03-02T10:30:00Z"
      }
    ],
    "total": 150,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  },
  "requestId": "req_abc123",
  "timestamp": "2026-03-02T10:35:00Z"
}
```

**Error (429):**
```json
{
  "success": false,
  "error": "Rate limit exceeded. Try again later.",
  "code": "RATE_LIMITED",
  "requestId": "req_abc123",
  "timestamp": "2026-03-02T10:35:00Z"
}

Headers:
Retry-After: 60
X-RateLimit-Remaining: 0
```

**Rate Limit:** 600 requests/minute per user

---

## Operational Endpoints

### GET /api/health
Health check for liveness/readiness probes.

**Request:** `GET /api/health`

**Response (200 - Healthy):**
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

**Response (503 - Degraded):**
```json
{
  "status": "degraded",
  "uptime": 3600000,
  "timestamp": "2026-03-02T10:30:00Z",
  "checks": {
    "database": "error",
    "memory": "warning"
  },
  "errors": [
    "Database error: connection timeout",
    "Heap usage at 78%"
  ]
}
```

**HTTP Status Codes:**
- 200: Healthy
- 503: Degraded or Unhealthy

**Use Case:** Kubernetes liveness/readiness probes, load balancer health checks

---

### GET /api/metrics
Application metrics and performance data (development/staging only).

**Request:** `GET /api/metrics`

**Response (200):**
```json
{
  "timestamp": "2026-03-02T10:30:00Z",
  "metrics": {
    "counters": {
      "api.requests.total": 15234,
      "api.errors.total": 42,
      "auth.login.success": 234,
      "auth.login.failure": 8,
      "analysis.completed": 156
    },
    "timers": {
      "api.request.duration_ms": {
        "count": 15234,
        "sum": 457402,
        "min": 5,
        "max": 8234,
        "avg": 30
      },
      "db.query.duration_ms": {
        "count": 45602,
        "sum": 912804,
        "min": 1,
        "max": 5000,
        "avg": 20
      },
      "analysis.duration_ms": {
        "count": 156,
        "sum": 1560000,
        "min": 5000,
        "max": 15000,
        "avg": 10000
      }
    }
  },
  "uptime": 3600,
  "memory": {
    "rss": 245000000,
    "heapUsed": 123000000,
    "heapTotal": 200000000,
    "external": 5000000
  }
}
```

**Error (403 - Production):**
```json
{
  "error": "Metrics endpoint disabled in production without auth"
}
```

**Access:** Development/Staging only (HTTP 403 in production unless protected by auth)

---

## Error Responses

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `AUTH_REQUIRED` | 401 | Authentication required |
| `PERMISSION_DENIED` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., email exists) |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Server error |

### Error Response Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "value"
  },
  "requestId": "req_abc123",
  "timestamp": "2026-03-02T10:30:00Z"
}
```

---

## Rate Limiting

### Headers

**Request Headers (input):**
```
X-Forwarded-For: 192.168.1.1  # Rate limit by client IP
```

**Response Headers (output):**
```
X-RateLimit-Remaining: 95     # Tokens remaining
Retry-After: 60               # Seconds until reset (if rate limited)
```

### Rate Limit Tiers

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 10 | per minute per IP |
| `/api/auth/register` | 10 | per minute per IP |
| `/api/analyze` | 600 | per minute per user |
| `/api/assessments` | 600 | per minute per user |
| `/api/assessments/advanced` | 600 | per minute per user |
| `/api/health` | unlimited | - |
| `/api/metrics` | unlimited | - |

---

## Authentication

### Session Cookie
```
Name: eip_session
Value: JWT token
HttpOnly: true
Secure: true (production)
SameSite: Lax
Max-Age: 604800 (7 days)
```

### JWT Claims
```json
{
  "userId": 1,
  "email": "user@example.com",
  "iat": 1709397000,
  "exp": 1710002000
}
```

### How to Use

**In Browser:**
- Automatically sent with requests (HttpOnly cookies)
- Cannot be accessed via JavaScript

**In API Clients:**
```bash
# After login, cookie is set by server
curl -c cookies.txt https://api.example.com/api/auth/login \
  -d '{"email":"...","password":"..."}'

# Subsequent requests
curl -b cookies.txt https://api.example.com/api/analyze
```

---

## Pagination

### Simple Pagination (GET /api/assessments)
```
?limit=20&offset=0

Returns: assessments[0..19]
Next page: offset=20
```

### Advanced Pagination (GET /api/assessments/advanced)
```json
{
  "data": {...items...},
  "total": 150,
  "page": 1,
  "pageSize": 20,
  "hasMore": true
}
```

**Calculate next page:**
```javascript
const offset = (page - 1) * pageSize;
const hasMore = offset + pageSize < total;
const nextOffset = hasMore ? offset + pageSize : offset;
```

---

## Example Workflows

### Workflow 1: Register → Login → Analyze
```bash
# 1. Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Pass123456"}'

# 2. Login (sets cookie)
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Pass123456"}'

# 3. Run analysis (uses cookie)
curl -b cookies.txt -X POST http://localhost:3000/api/analyze

# 4. Get history
curl -b cookies.txt http://localhost:3000/api/assessments?limit=10
```

### Workflow 2: Advanced Search with Filters
```bash
curl -b cookies.txt \
  "http://localhost:3000/api/assessments/advanced?
  sortBy=score&
  sortOrder=desc&
  minScore=60&
  impactLevel=HIGH&
  search=oil"
```

---

## Monitoring & Observability

### Request ID Correlation
Every response includes a `requestId` for tracing:
```json
{
  "requestId": "req_3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "timestamp": "2026-03-02T10:30:00Z"
}
```

Use this ID to correlate logs across services.

### Structured Logging
All operations log structured JSON:
```json
{
  "timestamp": "2026-03-02T10:30:00Z",
  "level": "info",
  "message": "User login",
  "context": {
    "userId": 1,
    "email": "user@example.com",
    "requestId": "req_abc123"
  }
}
```

---

