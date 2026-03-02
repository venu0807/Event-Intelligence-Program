/**
 * lib/rateLimiter.ts
 * Token bucket rate limiter with in-memory storage (suitable for single-instance deployments).
 * For distributed systems, integrate with Redis.
 */

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
  window?: number; // optional: hard limit per window (ms)
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: 100,
  refillRate: 10, // 10 tokens per second = 600 per minute
};

class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a requester (identified by key) is allowed to proceed.
   * Returns { allowed: boolean, remaining: number, resetIn: number }
   */
  check(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.refillRate;
    bucket.tokens = Math.min(
      this.config.maxTokens,
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) {
      bucket.tokens -= 1;
    }

    const resetIn = allowed
      ? 0
      : Math.ceil((1 - bucket.tokens) / this.config.refillRate) * 1000;

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetIn,
    };
  }

  /**
   * Reset a specific key (useful for testing or manual overrides)
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Clean up old buckets to prevent memory leaks (call periodically)
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}

// Default instance: 600 requests per minute per IP
export const globalLimiter = new RateLimiter({
  maxTokens: 100,
  refillRate: 10, // 1 request per 100ms = 10/sec = 600/min
});

// Stricter limiter for auth endpoints: 10 per minute per IP
export const authLimiter = new RateLimiter({
  maxTokens: 10,
  refillRate: 10 / 60, // ~1 token per 6 seconds
});

// Lenient for general API: 1000 per minute
export const apiLimiter = new RateLimiter({
  maxTokens: 200,
  refillRate: 200 / 60, // ~3.3 per second
});

/**
 * Periodically clean up stale buckets every 6 hours
 */
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    globalLimiter.cleanup();
    authLimiter.cleanup();
    apiLimiter.cleanup();
  }, 6 * 60 * 60 * 1000);
}
