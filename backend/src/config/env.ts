import { z } from 'zod';

/** The development secret published in `.env.example`; must never run in production. */
const PUBLISHED_DEV_SECRET = 'dev-only-secret-change-me-dev-only-secret-change-me';

/** True for a bare origin such as `https://app.example.com` (no path, no wildcard). Never throws. */
function isBareOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const originList = z
  .string()
  .transform((raw) =>
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z
      .array(
        z
          .string()
          .refine(
            isBareOrigin,
            'must be a bare origin such as https://app.example.com (wildcards are not allowed)',
          ),
      )
      .min(1),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Number of reverse-proxy hops to trust for client IPs (0 = none). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),

  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('dealership-api'),
  JWT_AUDIENCE: z.string().min(1).default('dealership-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  CORS_ORIGINS: originList.default(['http://localhost:5173']),

  // OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane.
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(1_024).default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),

  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(15 * 60 * 1_000),
});

export type Env = z.infer<typeof schema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Parses and validates configuration. Error messages list variable names and
 * the reason only — never the offending values, which may be secrets.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }

  const env = result.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET === PUBLISHED_DEV_SECRET) {
      throw new ConfigError(
        'Invalid configuration:\n  JWT_SECRET: the published development secret cannot be used in production',
      );
    }
    if (source.CORS_ORIGINS === undefined) {
      throw new ConfigError(
        'Invalid configuration:\n  CORS_ORIGINS: must be set explicitly in production',
      );
    }
  }
  return env;
}
