/**
 * lib/metrics.ts
 * Application metrics collection (timing, counts, etc.)
 * Can be exported to Prometheus, DataDog, CloudWatch, etc.
 */

interface MetricValue {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
}

class Metrics {
  private counters = new Map<string, number>();
  private timers = new Map<string, number[]>();

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1): void {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }

  /**
   * Record a timer value (in ms)
   */
  recordTimer(name: string, ms: number): void {
    if (!this.timers.has(name)) {
      this.timers.set(name, []);
    }
    this.timers.get(name)!.push(ms);
  }

  /**
   * Time a function execution
   */
  async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.recordTimer(name, Date.now() - start);
    }
  }

  /**
   * Time a sync function execution
   */
  timeSync<T>(name: string, fn: () => T): T {
    const start = Date.now();
    try {
      return fn();
    } finally {
      this.recordTimer(name, Date.now() - start);
    }
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get timer statistics
   */
  getTimer(name: string): MetricValue | null {
    const values = this.timers.get(name);
    if (!values || values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      sum,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
    };
  }

  /**
   * Export all metrics as object
   */
  export(): {
    counters: Record<string, number>;
    timers: Record<string, MetricValue>;
  } {
    const timers: Record<string, MetricValue> = {};
    for (const [name, stats] of Array.from(this.timers.entries())) {
      const s = this.getTimer(name);
      if (s) timers[name] = s;
    }

    return {
      counters: Object.fromEntries(this.counters),
      timers,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.timers.clear();
  }
}

export const metrics = new Metrics();

/**
 * Important metric names (conventions)
 */
export const METRIC_NAMES = {
  // API calls
  API_REQUEST_TOTAL: 'api.requests.total',
  API_REQUEST_DURATION: 'api.request.duration_ms',
  API_ERROR_TOTAL: 'api.errors.total',

  // Database
  DB_QUERY_DURATION: 'db.query.duration_ms',
  DB_CONNECTION_ERROR: 'db.connection.errors',

  // Auth
  AUTH_LOGIN_ATTEMPT: 'auth.login.attempts',
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',

  // Analysis
  ANALYSIS_STARTED: 'analysis.started',
  ANALYSIS_COMPLETED: 'analysis.completed',
  ANALYSIS_FAILED: 'analysis.failed',
  ANALYSIS_DURATION: 'analysis.duration_ms',

  // Cache
  CACHE_HIT: 'cache.hit',
  CACHE_MISS: 'cache.miss',
};
