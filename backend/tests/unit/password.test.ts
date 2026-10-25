import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../../src/modules/auth/password.js';

const hasher = createPasswordHasher({ memoryKiB: 1024, timeCost: 1 });

describe('password hasher (Argon2id)', () => {
  it('produces an argon2id PHC string that never contains the plaintext', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('correct horse');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('S3cret-pass!');
    await expect(hasher.verify(hash, 'S3cret-pass!')).resolves.toBe(true);
    await expect(hasher.verify(hash, 's3cret-pass!')).resolves.toBe(false);
  });

  it('salts each hash so equal passwords produce different hashes', async () => {
    const [a, b] = await Promise.all([hasher.hash('same-password'), hasher.hash('same-password')]);
    expect(a).not.toBe(b);
  });

  it('returns false (does not throw) for a malformed stored hash', async () => {
    await expect(hasher.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });

  it('honours the configured cost parameters', async () => {
    const hash = await hasher.hash('x-password-1');
    // Parameter order in the PHC string is library-specific, so check each parameter on its own.
    expect(hash).toMatch(/[$,]m=1024[,$]/);
    expect(hash).toMatch(/[$,]t=1[,$]/);
    expect(hash).toMatch(/[$,]p=1[,$]/);
  });

  it('offers a dummy verification so unknown-email logins cost the same as real ones', async () => {
    await expect(hasher.verifyDummy('anything')).resolves.toBe(false);
  });
});
