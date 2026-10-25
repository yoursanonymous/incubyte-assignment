import type { RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { Errors } from '../domain/errors.js';

interface Schemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

export interface Validated<P = unknown, Q = unknown, B = unknown> {
  params: P;
  query: Q;
  body: B;
}

/**
 * Validates params, query and body with Zod and stores the *parsed* values on `res.locals`.
 * Controllers read only the parsed values, so unvalidated input never reaches business logic.
 * Issue details name the offending field and rule but never echo submitted values.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const parsed: Validated = { params: {}, query: {}, body: {} };
    const details: { in: string; path: string; message: string }[] = [];

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        parsed[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ in: part, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) return next(Errors.validation(details));
    res.locals.validated = parsed;
    next();
  };
}

export function getValidated<P = unknown, Q = unknown, B = unknown>(
  res: Response,
): Validated<P, Q, B> {
  return res.locals.validated as Validated<P, Q, B>;
}
