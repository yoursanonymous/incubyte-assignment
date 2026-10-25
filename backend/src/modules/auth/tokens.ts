import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { Errors } from '../../domain/errors.js';
import { Roles, type RoleName } from '../../domain/roles.js';

export interface TokenConfig {
  secret: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
}

export interface AccessTokenClaims {
  userId: string;
  role: RoleName;
}

export interface TokenService {
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
  /** Resolves the claims of a valid token; throws a 401 AppError for every kind of invalid token. */
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}

/** Only HS256 is accepted, which also rules out `alg=none` and algorithm-confusion attacks. */
const ALGORITHM = 'HS256';
const ROLE_VALUES: readonly string[] = Object.values(Roles);

export function createTokenService(
  config: TokenConfig,
  now: () => Date = () => new Date(),
): TokenService {
  const key = new TextEncoder().encode(config.secret);

  return {
    async signAccessToken({ userId, role }) {
      const issuedAt = Math.floor(now().getTime() / 1000);
      return new SignJWT({ role })
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(userId)
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + config.accessTtlSeconds)
        .setJti(randomUUID())
        .sign(key);
    },

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          issuer: config.issuer,
          audience: config.audience,
          currentDate: now(),
        });
        const role = payload.role;
        if (typeof payload.sub !== 'string' || payload.sub === '')
          throw new Error('missing subject');
        if (typeof role !== 'string' || !ROLE_VALUES.includes(role))
          throw new Error('unknown role');
        return { userId: payload.sub, role: role as RoleName };
      } catch {
        // Deliberately uniform: callers learn nothing about *why* a token was refused.
        throw Errors.unauthenticated('Invalid or expired access token.');
      }
    },
  };
}

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** 256 bits of randomness. Only the SHA-256 hash is ever persisted. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}
