import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, Next } from 'hono';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerContext {
  requestId?: string;
  userId?: string;
  repoId?: string;
  [key: string]: any;
}

const asyncLocalStorage = new AsyncLocalStorage<LoggerContext>();

class Logger {
  private log(level: LogLevel, message: string, meta?: object) {
    const context = asyncLocalStorage.getStore() || {};
    const timestamp = new Date().toISOString();
    let safeMeta: Record<string, any> = { ...meta };
    if (meta && 'error' in meta && meta.error instanceof Error) {
      safeMeta = {
        ...meta,
        error: {
          name: meta.error.name,
          message: meta.error.message,
          stack: meta.error.stack,
          cause: meta.error.cause,
        },
      };
    }
    // Truncate large string values to prevent logging full release bodies on errors
    for (const key of Object.keys(safeMeta)) {
      if (typeof safeMeta[key] === 'string' && safeMeta[key].length > 500) {
        safeMeta[key] = safeMeta[key].slice(0, 500) + '...[truncated]';
      }
    }
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
      ...safeMeta,
    };
    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, meta?: object) {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: object) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: object) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: object) {
    this.log('error', message, meta);
  }
}

export const logger = new Logger();

// Legacy exports for backward compatibility
export function logError(
  message: string,
  context: Record<string, any> = {},
  error?: unknown
) {
  logger.error(message, {
    ...context,
    error,
  });
}

export function logInfo(
  message: string,
  context: Record<string, any> = {}
) {
  logger.info(message, context);
}

export function setLoggerContext(context: Partial<LoggerContext>) {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, context);
  }
}

export const requestLogger = async (c: Context, next: Next) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const { method, path } = c.req;
  const context: LoggerContext = {
    requestId,
  };

  await asyncLocalStorage.run(context, async () => {
    logger.info(`Incoming request: ${method} ${path}`, {
      req: {
        method,
        path,
        userAgent: c.req.header('User-Agent'),
      },
    });
    try {
      await next();
    } catch (err) {
      logger.error('Request failed', { error: err });
      throw err;
    } finally {
      const duration = Date.now() - start;
      const status = c.res.status;
      logger.info(`Request completed`, {
        res: {
          status,
          duration,
        },
      });
    }
  });
};
