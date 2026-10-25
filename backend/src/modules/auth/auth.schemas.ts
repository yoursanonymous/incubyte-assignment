import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Strict objects reject unknown keys, which blocks mass assignment (e.g. `role: "ADMIN"`). */
export const registerBody = z.strictObject({
  email,
  password: z
    .string()
    .min(10, 'must be at least 10 characters')
    .max(128, 'must be at most 128 characters'),
});

export const loginBody = z.strictObject({
  email,
  // No minimum here: login must not reveal or depend on the password policy.
  password: z.string().min(1).max(128),
});

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
