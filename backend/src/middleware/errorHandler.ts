import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError, Errors, type ErrorCode } from '../domain/errors.js';

interface BodyParserError {
  type?: string;
  status?: number;
}

const UNAVAILABLE_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  '57P01',
  '57P03',
  '53300',
]);

/** Detects connection-level database failures (as opposed to bugs) anywhere in the error chain. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const e = current as {
      name?: string;
      code?: unknown;
      message?: string;
      cause?: unknown;
      meta?: { driverAdapterError?: unknown };
    };
    if (e.name === 'PrismaClientInitializationError') return true;
    if (typeof e.code === 'string' && UNAVAILABLE_CODES.has(e.code)) return true;
    if (
      typeof e.message === 'string' &&
      /connection (terminated|timeout)|timeout exceeded when trying to connect/i.test(e.message)
    )
      return true;
    current = e.cause ?? e.meta?.driverAdapterError;
  }
  return false;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(Errors.notFound('Route'));

function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  const parser = error as BodyParserError;
  if (parser?.type === 'entity.parse.failed')
    return Errors.validation(null, 'Request body is not valid JSON.');
  if (parser?.type === 'entity.too.large')
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  if (
    typeof parser?.status === 'number' &&
    parser.status >= 400 &&
    parser.status < 500 &&
    parser.type
  ) {
    return Errors.validation(null, 'Request body could not be read.');
  }
  if (isDatabaseUnavailable(error)) return Errors.serviceUnavailable();
  return null;
}

/** Central error handler: client-safe envelope for known errors, generic 500 (logged) otherwise. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const requestId = String(req.id ?? '');
    const known = toAppError(error);

    if (known) {
      if (known.status >= 500) logger.error({ err: error, requestId }, 'service error');
      res.status(known.status).json(envelope(known.code, known.message, known.details, requestId));
      return;
    }

    logger.error({ err: error, requestId }, 'unhandled error');
    res
      .status(500)
      .json(envelope('INTERNAL_ERROR', 'An unexpected error occurred.', null, requestId));
  };
}

function envelope(code: ErrorCode, message: string, details: unknown, requestId: string) {
  return { error: { code, message, details, requestId } };
}
