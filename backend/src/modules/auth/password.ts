import argon2 from 'argon2';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  /** Returns false for a wrong password or an unparseable stored hash; never throws on bad input. */
  verify(storedHash: string, plain: string): Promise<boolean>;
  /**
   * Spends the same time as a real verification and always returns false. Used when the
   * account does not exist so login timing does not reveal which emails are registered.
   */
  verifyDummy(plain: string): Promise<boolean>;
}

export interface PasswordHasherOptions {
  memoryKiB: number;
  timeCost: number;
}

export function createPasswordHasher({
  memoryKiB,
  timeCost,
}: PasswordHasherOptions): PasswordHasher {
  const options = {
    type: argon2.argon2id,
    memoryCost: memoryKiB,
    timeCost,
    parallelism: 1,
  } as const;
  let dummyHash: Promise<string> | undefined;

  return {
    hash: (plain) => argon2.hash(plain, options),

    async verify(storedHash, plain) {
      try {
        return await argon2.verify(storedHash, plain);
      } catch {
        return false;
      }
    },

    async verifyDummy(plain) {
      dummyHash ??= argon2.hash('dummy-password-for-timing-equalisation', options);
      await argon2.verify(await dummyHash, plain).catch(() => false);
      return false;
    },
  };
}
