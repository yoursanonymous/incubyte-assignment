import { z } from 'zod';
import type { Db } from '../../infrastructure/db.js';
import type { PasswordHasher } from './password.js';

/** The password published in .env.example; never acceptable outside local development. */
export const KNOWN_DEFAULT_ADMIN_PASSWORD = 'ChangeMe-Admin-123!';

const input = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12, 'must be at least 12 characters').max(128),
});

/**
 * Out-of-band administrator provisioning (CLI / seed). This is the ONLY code path that assigns
 * the ADMIN role; the public API cannot. Existing accounts are promoted without touching their
 * password, so re-running is safe and never resets credentials.
 */
export async function provisionAdmin(
  db: Db,
  hasher: PasswordHasher,
  raw: { email: string; password: string },
  options: { forbidDefaultPassword?: boolean } = {},
): Promise<{ created: boolean; id: string; email: string }> {
  const { email, password } = input.parse(raw);
  if (options.forbidDefaultPassword && password === KNOWN_DEFAULT_ADMIN_PASSWORD) {
    throw new Error('Refusing to use the published default admin password. Set ADMIN_PASSWORD.');
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const updated = await db.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN', status: 'ACTIVE' },
    });
    return { created: false, id: updated.id, email };
  }
  const created = await db.user.create({
    data: { email, passwordHash: await hasher.hash(password), role: 'ADMIN' },
  });
  return { created: true, id: created.id, email };
}
