/**
 * lib/logger.ts
 * Structured logging with levels, context, and optional external integrations.
 * Designed for easy integration with monitoring platforms (DataDog, New Relic, etc).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private minLevel: number;
  private levelMap = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = this.levelMap[minLevel];
  }

  private format(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelMap[level] >= this.minLevel;
  }

  private log(level: LogLevel, message: string, context?: LogContext | Error) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context instanceof Error) {
      entry.error = {
        name: context.name,
        message: context.message,
        stack: context.stack,
      };
    } else if (context) {
      entry.context = context;
    }

    const output = this.format(entry);

    if (level === 'error' || level === 'fatal') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, error: Error | LogContext) {
    this.log('error', message, error);
  }

  fatal(message: string, error: Error | LogContext) {
    this.log('fatal', message, error);
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);
