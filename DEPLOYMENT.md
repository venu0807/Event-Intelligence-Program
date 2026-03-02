# Production Deployment Guide

This guide covers deploying the Event Intelligence Platform to production with all advanced features enabled.

---

## Environment Variables

### Core Configuration
```env
# Node Environment
NODE_ENV=production

# Database
MYSQL_HOST=your-rds-endpoint.rds.amazonaws.com
MYSQL_PORT=3306
MYSQL_USER=admin
MYSQL_PASSWORD=$(aws secretsmanager get-secret-value --secret-id prod/mysql-password)
MYSQL_DATABASE=event_intelligence

# Authentication
JWT_SECRET=$(openssl rand -hex 64)

# API Keys
NEWS_API_KEY=$(aws secretsmanager get-secret-value --secret-id prod/newsapi-key)
GEMINI_API_KEY=$(aws secretsmanager get-secret-value --secret-id prod/gemini-key)

# Advanced Features
LOG_LEVEL=info
AUDIT_ENDPOINT=https://your-audit-system.example.com/api/audit
METRICS_AUTH_TOKEN=$(openssl rand -hex 32)
```

### Optional: External Integrations
```env
# Datadog
DD_ENABLED=true
DD_SERVICE=event-intelligence
DD_ENV=production
DD_VERSION=1.0.0

# Sentry (error tracking)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project

# Redis (for distributed caching)
REDIS_URL=redis://prod-redis.example.com:6379
```

---

## Docker Deployment

### 1. Build Image
```bash
docker build -t event-intelligence:1.0.0 .
docker tag event-intelligence:1.0.0 your-registry/event-intelligence:1.0.0
docker push your-registry/event-intelligence:1.0.0
```

### 2. Docker Compose Production Stack
```yaml
version: '3.9'

services:
  app:
    image: your-registry/event-intelligence:1.0.0
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_DATABASE: event_intelligence
      JWT_SECRET: ${JWT_SECRET}
      NEWS_API_KEY: ${NEWS_API_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      LOG_LEVEL: info
    depends_on:
      mysql:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/api/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'

  mysql:
    image: mysql:8.0-alpine
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: event_intelligence
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'

volumes:
  mysql_data:
    driver: local
```

---

## Kubernetes Deployment

### 1. ConfigMap (for non-sensitive config)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: event-intelligence-config
  namespace: production
data:
  LOG_LEVEL: info
  NODE_ENV: production
  MYSQL_DATABASE: event_intelligence
```

### 2. Secret (for sensitive data)
```bash
kubectl create secret generic event-intelligence-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -hex 64) \
  --from-literal=MYSQL_PASSWORD=secure-password \
  --from-literal=NEWS_API_KEY=apikey \
  --from-literal=GEMINI_API_KEY=apikey \
  -n production
```

### 3. Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: event-intelligence
  namespace: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: event-intelligence
  template:
    metadata:
      labels:
        app: event-intelligence
    spec:
      containers:
      - name: app
        image: your-registry/event-intelligence:1.0.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3000
          name: http
        envFrom:
        - configMapRef:
            name: event-intelligence-config
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: event-intelligence-secrets
              key: JWT_SECRET
        - name: MYSQL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: event-intelligence-secrets
              key: MYSQL_PASSWORD
        - name: NEWS_API_KEY
          valueFrom:
            secretKeyRef:
              name: event-intelligence-secrets
              key: NEWS_API_KEY
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: event-intelligence-secrets
              key: GEMINI_API_KEY
        - name: MYSQL_HOST
          value: mysql.production.svc.cluster.local
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 40
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        resources:
          requests:
            cpu: '500m'
            memory: '512Mi'
          limits:
            cpu: '1000m'
            memory: '1Gi'
```

### 4. Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: event-intelligence
  namespace: production
spec:
  type: LoadBalancer
  selector:
    app: event-intelligence
  ports:
  - port: 80
    targetPort: 3000
    name: http
```

### 5. Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: event-intelligence
  namespace: production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - intelligence.example.com
    secretName: event-intelligence-tls
  rules:
  - host: intelligence.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: event-intelligence
            port:
              number: 80
```

---

## Monitoring & Observability

### Datadog Integration (Optional)
```bash
# Install Datadog agent
helm repo add datadog https://helm.datadoghq.com
helm install datadog datadog/datadog \
  --set datadog.apiKey=$DD_API_KEY \
  --set datadog.appKey=$DD_APP_KEY \
  -n monitoring
```

### Prometheus + Grafana
```yaml
# Scrape config for Prometheus
- job_name: 'event-intelligence'
  metrics_path: '/api/metrics'
  static_configs:
  - targets: ['localhost:3000']
```

### Alert Rules (Prometheus)
```yaml
groups:
- name: event-intelligence
  rules:
  - alert: HighErrorRate
    expr: rate(api_errors_total[5m]) > 0.05
    for: 5m
    annotations:
      summary: High error rate detected
      
  - alert: DatabaseDown
    expr: up{job="mysql"} == 0
    for: 1m
    annotations:
      summary: database is down
      
  - alert: HighHeapUsage
    expr: process_resident_memory_bytes > 900000000
    for: 5m
    annotations:
      summary: High memory usage
```

---

## Security Hardening

### 1. Database Security
```sql
-- Create application user (not root)
CREATE USER 'app_user'@'%' IDENTIFIED BY 'strong_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON event_intelligence.* TO 'app_user'@'%';
FLUSH PRIVILEGES;

-- Enable SSL for connections
ALTER USER 'app_user'@'%' REQUIRE SSL;
```

### 2. Rate Limiting Configuration
Adjust in production based on expected traffic:

```typescript
// lib/rateLimiter.ts
export const globalLimiter = new RateLimiter({
  maxTokens: 200,      // Allow 200 requests per surge
  refillRate: 50,      // Refill at 50/sec = 3000/min
});

export const authLimiter = new RateLimiter({
  maxTokens: 10,       // Hard limit on auth attempts
  refillRate: 2 / 60,  // 2 per minute
});
```

### 3. API Security Headers (via middleware)
```typescript
// middleware.ts - add security headers
export function middleware(req: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  return response;
}
```

### 4. Audit Log Archival
```bash
# Send audit logs to Splunk/S3 daily
0 0 * * * aws s3 sync /var/log/audit/ s3://my-audit-logs/$(date +%Y-%m-%d)/
```

---

## Performance Tuning

### MySQL Optimization
```sql
-- Indexes for common queries
CREATE INDEX idx_assessments_user_date 
  ON impact_assessments(triggered_by, created_at DESC);
CREATE INDEX idx_assessments_score 
  ON impact_assessments(overall_score);
CREATE INDEX idx_assessments_impact 
  ON impact_assessments(impact_level);

-- Connection pooling parameters (already set in db.ts)
-- Max connections: 10
-- Queue limit: 0 (unlimited)

-- Query cache (if using MySQL 5.7)
SET GLOBAL query_cache_type = ON;
SET GLOBAL query_cache_size = 268435456; -- 256MB
```

### Application Caching
```typescript
// Adjust cache TTLs in lib/cache.ts based on update frequency
export const assessmentCache = new Cache<Record<string, unknown>>(600); // 10 min
export const apiCache = new Cache<Record<string, unknown>>(120);       // 2 min
```

### Next.js Configuration
```javascript
// next.config.js
module.exports = {
  compress: true,
  poweredByHeader: false,
  experimental: {
    isrMemoryCacheSize: 50 * 1 * 1000 * 1000, // 50MB for ISR
  },
};
```

---

## Backup & Disaster Recovery

### Automated MySQL Backups
```bash
#!/bin/bash
# Daily backup via mysqldump
BACKUP_DIR="/backups/mysql"
DATE=$(date +%Y%m%d_%H%M%S)

mysqldump -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD \
  event_intelligence | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Upload to S3
aws s3 cp $BACKUP_DIR/db_$DATE.sql.gz s3://my-backups/mysql/

# Retain local copies for last 7 days
find $BACKUP_DIR -mtime +7 -delete
```

### Application Backup (Kubernetes)
```bash
# Use Velero for Kubernetes backup
velero backup create production-full \
  --include-namespaces production \
  --ttl 720h  # 30 days
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates obtained
- [ ] Rate limits adjusted for expected traffic
- [ ] Log aggregation endpoints configured
- [ ] Backup system tested
- [ ] Monitoring dashboards created
- [ ] Alert thresholds set

### During Deployment
- [ ] Health checks passing
- [ ] Database connectivity verified
- [ ] API endpoints responding correctly
- [ ] Rate limiting working
- [ ] Logs flowing to centralized system
- [ ] Metrics being collected

### Post-Deployment
- [ ] Monitor error rates for 24 hours
- [ ] Review audit logs for anomalies
- [ ] Verify cache hit rates
- [ ] Check database performance
- [ ] Test failover scenarios
- [ ] Document any issues

---

## Scaling Considerations

### Horizontal Scaling (Multiple Instances)
The application is stateless and can scale horizontally. Each instance:
- Connects to shared MySQL database
- Uses in-memory caching (can be replaced with Redis for distributed cache)
- Has independent rate limiters (can be replaced with centralized Redis-based limiters)

### For Multi-Instance Setup:
1. Replace in-memory rate limiting with Redis
2. Replace in-memory cache with Redis
3. Use database connection pooling (already configured)
4. Enable session affinity if needed (though not required since stateless)

### Example: Redis-Based Rate Limiter
```typescript
// Future enhancement: lib/rateLimiter-redis.ts
import redis from 'redis';

const client = redis.createClient({ host: process.env.REDIS_HOST });

export async function checkRateLimit(key: string, limit: number): Promise<boolean> {
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 60);
  return count <= limit;
}
```

---

## Maintenance Windows

### Rolling Updates
```bash
# Using Docker Compose
docker-compose up -d --no-deps --build app

# Using Kubernetes
kubectl set image deployment/event-intelligence \
  app=your-registry/event-intelligence:1.0.1 \
  -n production
```

### Database Migrations
```bash
# Before deploying schema changes
npm run db:migrate

# Or manually via schema-migrations table
INSERT INTO schema_migrations 
  (version, name, executed_at) 
VALUES ('001', 'initial_schema', NOW());
```

---

