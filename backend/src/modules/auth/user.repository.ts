import type { User } from '../../generated/prisma/client.js';
import type { TxClient } from '../../infrastructure/db.js';

export type UserRecord = User;

export function createUserRepository(client: TxClient) {
  return {
    findByEmail: (email: string) => client.user.findUnique({ where: { email } }),
    findById: (id: string) => client.user.findUnique({ where: { id } }),
    /** Role is deliberately fixed to CUSTOMER here; administrators are provisioned out-of-band. */
    createCustomer: (data: { email: string; passwordHash: string }) =>
      client.user.create({ data: { ...data, role: 'CUSTOMER' } }),
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
