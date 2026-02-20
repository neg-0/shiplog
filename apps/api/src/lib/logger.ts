export function logError(
  message: string,
  context: Record<string, any> = {},
  error?: unknown
) {
  const errorObj = {
    level: 'error',
    message,
    timestamp: new Date().toISOString(),
    ...context,
    error: error instanceof Error ?
      { message: error.message, stack: error.stack, name: error.name } :
      error,
  };

  console.error(JSON.stringify(errorObj));
}

export function logInfo(
  message: string,
  context: Record<string, any> = {}
) {
  const infoObj = {
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  console.log(JSON.stringify(infoObj));
}
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, Next } from 'hono';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface LoggerContext {
  requestId?: string;
  userId?: string;
  repoId?: string;
  [key: string]: any;
const asyncLocalStorage = new AsyncLocalStorage<LoggerContext>();
class Logger {
  private log(level: LogLevel, message: string, meta?: object) {
    const context = asyncLocalStorage.getStore() || {};
    const timestamp = new Date().toISOString();
    // Handle error objects in meta specially
    let safeMeta = { ...meta };
    if (meta && 'error' in meta && meta.error instanceof Error) {
      safeMeta = {
        ...meta,
        error: {
          name: meta.error.name,
          message: meta.error.message,
          stack: meta.error.stack,
          cause: meta.error.cause,
        }
      };
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
export const logger = new Logger();
export function setLoggerContext(context: Partial<LoggerContext>) {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, context);
  }
export const requestLogger = async (c: Context, next: Next) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const { method, path } = c.req;
  const context: LoggerContext = {
    requestId,
  await asyncLocalStorage.run(context, async () => {
    // Log request
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
      // If the error is handled by Hono's onError later, we might log it there too.
      // But logging here ensures we capture the context.
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
