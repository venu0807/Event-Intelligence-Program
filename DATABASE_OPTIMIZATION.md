# Database Optimization & Best Practices

Advanced database patterns, query optimization, and scaling strategies for the Event Intelligence Platform.

---

## Current Schema Analysis

### Tables

#### `users`
```sql
CREATE TABLE users (
  id INT UNSIGNED PK AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
);
```

**Optimization:**
- Email is indexed (UNIQUE constraint)
- Consider adding `last_login` timestamp and `status` field

#### `events`
```sql
CREATE TABLE events (
  id INT UNSIGNED PK AUTO_INCREMENT,
  title VARCHAR(1000) NOT NULL,
  description TEXT,
  source_name VARCHAR(255),
  url TEXT,
  published_at DATETIME,
  risk_category ENUM(...),
  article_score DECIMAL(5,2),
  keyword_matches JSON,
  created_at DATETIME
);
```

**Missing Indexes:**
```sql
-- Add for scoring queries
CREATE INDEX idx_events_article_score ON events(article_score DESC);
CREATE INDEX idx_events_risk_category ON events(risk_category);
CREATE INDEX idx_events_published ON events(published_at DESC);

-- Add for search
CREATE FULLTEXT INDEX idx_events_fulltext 
  ON events(title, description);
```

#### `impact_assessments`
```sql
CREATE TABLE impact_assessments (
  id INT UNSIGNED PK AUTO_INCREMENT,
  triggered_by INT UNSIGNED FK,
  overall_score DECIMAL(5,2),
  impact_level ENUM(...),
  dominant_category ENUM(...),
  category_breakdown JSON,
  article_count SMALLINT UNSIGNED,
  ai_summary LONGTEXT,
  created_at DATETIME
);
```

**Missing Index:**
```sql
-- Critical for user's assessment history
CREATE INDEX idx_assessments_user_date 
  ON impact_assessments(triggered_by, created_at DESC);

-- For impact queries
CREATE INDEX idx_assessments_level_score 
  ON impact_assessments(impact_level, overall_score);
```

#### `assessment_events` (junction table)
```sql
CREATE TABLE assessment_events (
  assessment_id INT UNSIGNED FK,
  event_id INT UNSIGNED FK,
  PRIMARY KEY (assessment_id, event_id)
);
```

**Status:** Good as-is (compound primary key is efficient)

---

## Query Optimization

### Problem Query 1: User's Assessment History
**Original (slow):**
```sql
SELECT * FROM impact_assessments
WHERE triggered_by = ?
ORDER BY created_at DESC
LIMIT 10;
```

**Optimized:**
```sql
-- Uses index idx_assessments_user_date
SELECT id, overall_score, impact_level, dominant_category, 
       created_at, article_count
FROM impact_assessments
WHERE triggered_by = ? AND created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
ORDER BY created_at DESC
LIMIT 10;
```

**Improvements:**
- Add date filter to limit scan (most users want recent)
- Only select needed columns
- Compound index avoids full table scan

### Problem Query 2: Search with Filters
**Original (n+1 pattern):**
```sql
-- Get assessments
SELECT * FROM impact_assessments WHERE triggered_by = ?;

-- For each assessment, get events (N queries!)
SELECT * FROM events WHERE id IN (SELECT event_id FROM assessment_events WHERE assessment_id = ?);
```

**Optimized (single query):**
```sql
-- Use queryBuilder.find() which handles this internally
SELECT ia.id, ia.overall_score, ia.impact_level, 
       ia.dominant_category, ia.article_count, ia.created_at
FROM impact_assessments ia
LEFT JOIN assessment_events ae ON ia.id = ae.assessment_id
LEFT JOIN events e ON ae.event_id = e.id
WHERE ia.triggered_by = ? 
  AND ia.overall_score >= ? 
  AND ia.impact_level = ?
  AND (e.title LIKE ? OR ia.ai_summary LIKE ?)
GROUP BY ia.id
ORDER BY ia.created_at DESC
LIMIT 20;
```

### Problem Query 3: Aggregate Statistics
**For dashboards:**
```sql
-- Get quick statistics for user
SELECT 
  COUNT(*) as total_assessments,
  AVG(overall_score) as avg_score,
  MAX(overall_score) as max_score,
  MIN(overall_score) as min_score,
  COUNT(CASE WHEN impact_level = 'HIGH' THEN 1 END) as high_count
FROM impact_assessments
WHERE triggered_by = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY triggered_by;
```

**Materialized View (for heavy read load):**
```sql
CREATE TABLE user_statistics (
  user_id INT UNSIGNED PRIMARY KEY,
  total_assessments INT,
  avg_score DECIMAL(5,2),
  max_score DECIMAL(5,2),
  min_score DECIMAL(5,2),
  high_count INT,
  updated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Refresh hourly
CREATE EVENT refresh_user_stats
ON SCHEDULE EVERY 1 HOUR
DO
  INSERT INTO user_statistics 
  SELECT triggered_by, COUNT(*), AVG(overall_score), MAX(overall_score),
         MIN(overall_score), COUNT(CASE WHEN impact_level='HIGH' THEN 1 END),
         NOW()
  FROM impact_assessments
  WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
  GROUP BY triggered_by
  ON DUPLICATE KEY UPDATE
    total_assessments = VALUES(total_assessments),
    avg_score = VALUES(avg_score),
    max_score = VALUES(max_score),
    min_score = VALUES(min_score),
    high_count = VALUES(high_count),
    updated_at = NOW();
```

---

## Advanced Index Strategies

### Covering Indexes (avoid reading data pages)
```sql
-- Query: SELECT overall_score, impact_level FROM assessments WHERE user_id = ? ORDER BY created_at
-- Issue: Needs to fetch data page for each row

-- Solution: covering index includes all queried columns
CREATE INDEX idx_assessments_covering 
  ON impact_assessments(triggered_by, created_at DESC, overall_score, impact_level);

-- Now query runs entirely from index (no data page lookups)
```

### Partitioning (for very large tables)
```sql
-- Partition assessments by month (keeps recent data hot in memory)
ALTER TABLE impact_assessments
PARTITION BY RANGE (YEAR_MONTH(created_at)) (
  PARTITION p202501 VALUES LESS THAN (202502),
  PARTITION p202502 VALUES LESS THAN (202503),
  PARTITION p202503 VALUES LESS THAN (202504),
  PARTITION pmax VALUES LESS THAN MAXVALUE
);

-- Benefits:
-- - Queries on recent data don't scan old partitions
-- - Can archive old partitions
-- - Faster DELETE for old data
```

### Composite Index Selection
```sql
-- Rule: (Equality, Range, Sort)
-- Find all HIGH impact for user, sorted by date

-- BAD: Multiple separate columns
CREATE INDEX idx1 ON impact_assessments(triggered_by);
CREATE INDEX idx2 ON impact_assessments(impact_level);
CREATE INDEX idx3 ON impact_assessments(created_at);

-- GOOD: Composite index in (Equality, Range, Sort) order
CREATE INDEX idx_compound 
  ON impact_assessments(triggered_by, impact_level, created_at DESC);

-- Query uses single index for all three columns
SELECT * FROM impact_assessments 
WHERE triggered_by = 123 AND impact_level = 'HIGH'
ORDER BY created_at DESC;
```

---

## Connection Pooling Optimization

### Current Configuration (lib/db.ts)
```typescript
return mysql.createPool({
  host: ...,
  connectionLimit: 10,    // ← Adjust based on concurrency
  queueLimit: 0,          // ← 0 = unlimited queue
  waitForConnections: true,
  timezone: 'Z'
});
```

### For Different Scales:

**Development (10 concurrent users)**
```typescript
connectionLimit: 5
```

**Production (100+ concurrent users)**
```typescript
connectionLimit: 20      // Monitor actual usage
queueLimit: 50          // Prevent unbounded queue
enableKeepAlive: true   // Reuse connections
```

**Scaled/High-Traffic (1000+ concurrent users)**
```typescript
// Consider PgBouncer or ProxySQL
// PgBouncer config:
/*
[databases]
event_intelligence = host=mysql.rds.amazonaws.com port=3306

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
*/
```

---

## Caching Strategy

### Cache Hierarchy
```
1. Application Cache (1-5 min) ← lib/cache.ts
   - Individual assessments
   - User statistics
   - Query results

2. Query Result Cache (5-10 min)
   - Complex joins
   - Aggregations

3. Database Buffer Pool (managed by MySQL)
   - Frequency-based

4. Disk SSD
```

### Cache Invalidation
```typescript
// Pattern: Cache-Aside with Invalidation
import { assessmentCache } from '@/lib/cache';

// On assessment creation
const newAssessment = await createAssessment(...);
// Invalidate related caches
assessmentCache.deletePattern(/user:${userId}:/);  // Clear all user caches
assessmentCache.deletePattern(/stats:${userId}:/); // Clear stats

return newAssessment;
```

### What NOT to Cache
- User credentials / session tokens
- Real-time data (within 30s)
- Large blobs (> 1MB)
- Rarely accessed data

---

## Monitoring & Diagnostics

### Slow Query Log
```sql
-- Enable slow query log (queries > 1 second)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
SET GLOBAL log_queries_not_using_indexes = 'ON';

-- View slow queries
tail -f /var/log/mysql/slow.log

-- Analyze with mysqldumpslow
mysqldumpslow /var/log/mysql/slow.log | head -20
```

### Query Execution Plan Analysis
```sql
-- Check how MySQL executes your query
EXPLAIN SELECT ... FROM impact_assessments WHERE ...;

-- More detailed analysis (MySQL 5.7+)
EXPLAIN FORMAT=JSON SELECT ... FROM impact_assessments WHERE ...;

-- Key columns to look for:
-- type: ALL (bad), ref/eq_ref (good), range (ok)
-- key: should use an index
-- rows: actual rows examined (lower is better)
-- Using where/Using filesort/Using temporary: usually bad
```

### Connection Monitoring
```sql
-- Check current connections
SHOW PROCESSLIST;

-- Find long-running queries
SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO 
FROM INFORMATION_SCHEMA.PROCESSLIST 
WHERE TIME > 60;

-- Kill long query
KILL QUERY <id>;
```

### Table Statistics
```sql
-- Check storage size
SELECT 
  TABLE_NAME, 
  ROUND(DATA_LENGTH / 1024 / 1024, 2) AS size_mb
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'event_intelligence'
ORDER BY DATA_LENGTH DESC;

-- Index statistics
SELECT 
  OBJECT_SCHEMA, OBJECT_NAME, COUNT_READ, COUNT_INSERT, COUNT_UPDATE, COUNT_DELETE
FROM performance_schema.table_io_waits_summary_by_table
WHERE OBJECT_SCHEMA = 'event_intelligence';
```

---

## Scaling Roadmap

### Phase 1: Single Server (Current)
- 1 MySQL instance
- In-memory caching
- In-memory rate limiting
- Suitable for: <1000 users, <100 QPS

### Phase 2: Database Read Replicas
```sql
-- Create read replica
CHANGE MASTER TO
  MASTER_HOST='primary.rds.amazonaws.com',
  MASTER_USER='repl',
  MASTER_PASSWORD='password';

START SLAVE;
```

**Routing:**
- Writes → Primary
- Reads → Replica(s) via read-primary pattern

### Phase 3: Distributed Caching (Redis)
```typescript
// Replace lib/cache.ts with Redis
import redis from 'redis';
const cache = redis.createClient({
  host: process.env.REDIS_HOST,
  maxRetriesPerRequest: null
});

export async function get(key: string) {
  return await cache.get(key);
}
```

### Phase 4: Query Caching Layer (ProxySQL)
```sql
-- ProxySQL config
INSERT INTO mysql_query_rules 
  (rule_id, match_pattern, cache_ttl_ms, cache_empty_result)
VALUES
  (1, 'SELECT.*FROM impact_assessments WHERE triggered_by.*', 300000, 0);

LOAD MYSQL QUERY RULES TO RUNTIME;
```

### Phase 5: Sharding (if >10M assessments)
```
Shard by user_id:
- Shard 1: users 0-100k
- Shard 2: users 100k-200k
- etc.

Each shard gets its own MySQL instance
Router service determines shard from user_id
```

---

## Backup & Recovery

### Continuous Binary Log Backups
```bash
#!/bin/bash
# Backup binary logs hourly (point-in-time recovery)
BINLOG_DIR="/var/lib/mysql"
BACKUP_DIR="/backups/binlogs"

# Find new binary logs
mysqlbinlog --raw --read-from-remote-server \
  -h $MYSQL_HOST -u backup_user -p$PASS \
  $(tail -1 $BACKUP_DIR/.position) | \
  gzip > $BACKUP_DIR/$(date +%Y%m%d_%H%M%S).binlog.gz

# Upload to S3
aws s3 sync $BACKUP_DIR s3://my-backups/binlogs/
```

### Point-in-Time Recovery
```bash
# Recover to specific time
mysqlbinlog /backups/mysql/db_20260302.sql.gz \
  --start-datetime="2026-03-02 10:00:00" \
  --stop-datetime="2026-03-02 10:30:00" | \
  mysql -u root -p

# Or to specific position (lower risk)
mysqlbinlog /backups/binlogs/mysql-bin.000123 \
  --start-position=1000 \
  --stop-position=2000 | \
  mysql -u root -p
```

---

## Compliance & Audit

### Audit Logging
```sql
-- Track all queries for compliance
SET GLOBAL general_log = 'ON';
SET GLOBAL log_output = 'TABLE';

-- Query audit tables
SELECT * FROM mysql.general_log 
WHERE argument LIKE '%UPDATE users%';
```

### Data Protection
```sql
-- Replace PII in backups (GDPR)
UPDATE users SET email = CONCAT('redacted_', id, '@internal.local');
UPDATE events SET description = 'REDACTED';

-- Encrypt sensitive columns
ALTER TABLE users MODIFY COLUMN password_hash VARBINARY(500);
-- In application: encrypt before INSERT, decrypt after SELECT
```

---

## Performance Benchmarks

### Expected Performance

| Operation | Latency | Throughput |
|-----------|---------|-----------|
| GET /api/assessments | 50-100ms | 100 req/s per instance |
| POST /api/analyze | 5-15s | 5-10 per minute |
| Health check | <5ms | 1000 req/s |
| Rate limiter check | <1ms | 10000 req/s |

### Optimization Targets

| Metric | Target | Current |
|--------|--------|---------|
| DB query p99 | <100ms | ~50ms ✓ |
| Cache hit rate | >70% | ~60% → improve with longer TTL |
| Connection pool utilization | <80% | Monitor continuously |
| Memory usage | <80% | Set alerts at 75% |

---

