import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Assigns a correlation id (reusing a well-formed inbound X-Request-Id), echoes it in the
 * response, and logs one structured line per request without headers, bodies or query strings.
 */
export function requestContext(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const supplied = req.headers['x-request-id'];
      const id =
        typeof supplied === 'string' && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        path: req.url.split('?')[0],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req, res, error) =>
      error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
  });
}
