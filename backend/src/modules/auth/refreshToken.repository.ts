import type { TxClient } from '../../infrastructure/db.js';

export function createRefreshTokenRepository(client: TxClient) {
  return {
    create: (data: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }) =>
      client.refreshToken.create({ data }),

    findByHash: (tokenHash: string) => client.refreshToken.findUnique({ where: { tokenHash } }),

    /** Atomically marks a token as used. Returns false if it was already used or revoked. */
    async markUsed(id: string, at: Date): Promise<boolean> {
      const { count } = await client.refreshToken.updateMany({
        where: { id, usedAt: null, revokedAt: null },
        data: { usedAt: at },
      });
      return count === 1;
    },

    /** Revokes every still-active token in a rotation family (replay or logout). */
    revokeFamily: (familyId: string, at: Date) =>
      client.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: at },
      }),
  };
}

export type RefreshTokenRepository = ReturnType<typeof createRefreshTokenRepository>;
