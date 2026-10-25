import type { RoleName } from '../domain/roles.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware from the *database* record, never from client input. */
      auth?: { userId: string; role: RoleName };
    }
  }
}

export {};
