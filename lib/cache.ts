/**
 * lib/cache.ts
 * Simple in-memory cache with TTL and invalidation support.
 * For distributed systems, integrate with Redis.
 */

import { logger } from './logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private ttl: number; // milliseconds

  constructor(ttlSeconds: number = 300) {
    this.ttl = ttlSeconds * 1000;

    // Periodically clean up expired entries every minute
    if (process.env.NODE_ENV !== 'test') {
      setInterval(() => this.cleanup(), 60 * 1000);
    }
  }

  /**
   * Get a value from cache (returns null if expired or not found)
   */
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttlSeconds?: number): void {
    const expiresAt = Date.now() + (ttlSeconds ? ttlSeconds * 1000 : this.ttl);
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   */
  deletePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) {
        this.store.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`Cache cleanup: removed ${count} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; entries: Array<{ key: string; ttlMs: number }> } {
    const now = Date.now();
    return {
      size: this.store.size,
      entries: Array.from(this.store.entries()).map(([key, entry]) => ({
        key,
        ttlMs: Math.max(0, entry.expiresAt - now),
      })),
    };
  }
}

// Assessment cache: 5 minute TTL
export const assessmentCache = new Cache<Record<string, unknown>>(300);

// User session metadata cache: 7 day TTL
export const sessionCache = new Cache<Record<string, unknown>>(7 * 24 * 60 * 60);

// API response cache: 1 minute TTL
export const apiCache = new Cache<Record<string, unknown>>(60);
