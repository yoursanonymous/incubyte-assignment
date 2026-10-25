import { randomUUID } from 'node:crypto';
import { Errors } from '../../domain/errors.js';
import type { RoleName } from '../../domain/roles.js';
import { isUniqueViolation, type Db, type TxClient } from '../../infrastructure/db.js';
import type { LoginBody, RegisterBody } from './auth.schemas.js';
import type { PasswordHasher } from './password.js';
import { createRefreshTokenRepository } from './refreshToken.repository.js';
import { generateRefreshToken, sha256Hex, type TokenService } from './tokens.js';
import { createUserRepository, type UserRecord } from './user.repository.js';

export interface PublicUser {
  id: string;
  email: string;
  role: RoleName;
  createdAt: Date;
}

export interface Session {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthServiceDeps {
  db: Db;
  tokens: TokenService;
  hasher: PasswordHasher;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  now?: () => Date;
}

/** Whitelists fields so a password hash can never leak through a response. */
export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});

const INVALID_CREDENTIALS = 'Invalid email or password.';

export function createAuthService(deps: AuthServiceDeps) {
  const { db, tokens, hasher } = deps;
  const now = deps.now ?? (() => new Date());

  async function issueSession(
    user: UserRecord,
    familyId: string,
    client: TxClient,
  ): Promise<Session> {
    const refresh = generateRefreshToken();
    const refreshExpiresAt = new Date(now().getTime() + deps.refreshTtlDays * 86_400_000);
    await createRefreshTokenRepository(client).create({
      userId: user.id,
      familyId,
      tokenHash: refresh.hash,
      expiresAt: refreshExpiresAt,
    });
    return {
      user: toPublicUser(user),
      accessToken: await tokens.signAccessToken({ userId: user.id, role: user.role }),
      expiresIn: deps.accessTtlSeconds,
      refreshToken: refresh.token,
      refreshExpiresAt,
    };
  }

  return {
    async register(input: RegisterBody): Promise<Session> {
      const passwordHash = await hasher.hash(input.password);
      try {
        const user = await createUserRepository(db).createCustomer({
          email: input.email,
          passwordHash,
        });
        return await issueSession(user, randomUUID(), db);
      } catch (error) {
        // The unique index, not a read-then-write check, is what makes duplicate registration race-safe.
        if (isUniqueViolation(error)) throw Errors.emailTaken();
        throw error;
      }
    },

    async login(input: LoginBody): Promise<Session> {
      const user = await createUserRepository(db).findByEmail(input.email);
      // Always spend one hash verification so timing does not reveal whether the email exists.
      const passwordOk = user
        ? await hasher.verify(user.passwordHash, input.password)
        : await hasher.verifyDummy(input.password);
      if (!user || !passwordOk || user.status !== 'ACTIVE')
        throw Errors.unauthenticated(INVALID_CREDENTIALS);
      return issueSession(user, randomUUID(), db);
    },

    /**
     * Rotates a refresh token. Presenting an already-used or revoked token is treated as theft:
     * the whole family is revoked. The revocation happens inside the transaction and the 401 is
     * thrown only after it commits, so the revocation is not rolled back.
     */
    async refresh(rawToken: string | undefined): Promise<Session> {
      if (!rawToken) throw Errors.unauthenticated('Invalid or expired session.');
      const hash = sha256Hex(rawToken);
      const at = now();

      const outcome = await db.$transaction(async (tx) => {
        const repo = createRefreshTokenRepository(tx);
        const row = await repo.findByHash(hash);
        if (!row) return { ok: false } as const;

        if (row.usedAt || row.revokedAt) {
          await repo.revokeFamily(row.familyId, at);
          return { ok: false } as const;
        }
        if (row.expiresAt <= at) return { ok: false } as const;

        const user = await createUserRepository(tx).findById(row.userId);
        if (!user || user.status !== 'ACTIVE') {
          await repo.revokeFamily(row.familyId, at);
          return { ok: false } as const;
        }

        // Conditional update: of two concurrent uses of one token only one can win.
        if (!(await repo.markUsed(row.id, at))) {
          await repo.revokeFamily(row.familyId, at);
          return { ok: false } as const;
        }
        return { ok: true, session: await issueSession(user, row.familyId, tx) } as const;
      });

      if (!outcome.ok) throw Errors.unauthenticated('Invalid or expired session.');
      return outcome.session;
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      const repo = createRefreshTokenRepository(db);
      const row = await repo.findByHash(sha256Hex(rawToken));
      if (row) await repo.revokeFamily(row.familyId, now());
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
