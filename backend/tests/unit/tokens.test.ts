import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/domain/errors.js';
import { createTokenService, generateRefreshToken } from '../../src/modules/auth/tokens.js';

const config = {
  secret: 'unit-test-secret-unit-test-secret-unit-test!!',
  issuer: 'dealership-api',
  audience: 'dealership-web',
  accessTtlSeconds: 900,
};
const T0 = new Date('2026-01-01T00:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const encode = (s: string) => new TextEncoder().encode(s);

describe('access tokens', () => {
  it('round-trips subject and role', async () => {
    const tokens = createTokenService(config, () => T0);
    const jwt = await tokens.signAccessToken({ userId: 'u-1', role: 'ADMIN' });
    await expect(tokens.verifyAccessToken(jwt)).resolves.toEqual({ userId: 'u-1', role: 'ADMIN' });
  });

  it('is accepted just before expiry and rejected after it', async () => {
    const issuer = createTokenService(config, () => T0);
    const jwt = await issuer.signAccessToken({ userId: 'u-1', role: 'CUSTOMER' });
    await expect(
      createTokenService(config, () => at(899)).verifyAccessToken(jwt),
    ).resolves.toBeTruthy();
    await expect(
      createTokenService(config, () => at(901)).verifyAccessToken(jwt),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a token signed with a different secret', async () => {
    const other = createTokenService(
      { ...config, secret: 'a-completely-different-secret-value-123456' },
      () => T0,
    );
    const jwt = await other.signAccessToken({ userId: 'u-1', role: 'CUSTOMER' });
    await expect(createTokenService(config, () => T0).verifyAccessToken(jwt)).rejects.toMatchObject(
      {
        status: 401,
        code: 'UNAUTHENTICATED',
      },
    );
  });

  it('rejects the wrong issuer and the wrong audience', async () => {
    const jwtFor = (override: Partial<typeof config>) =>
      createTokenService({ ...config, ...override }, () => T0).signAccessToken({
        userId: 'u',
        role: 'CUSTOMER',
      });
    const verifier = createTokenService(config, () => T0);
    await expect(
      verifier.verifyAccessToken(await jwtFor({ issuer: 'evil' })),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      verifier.verifyAccessToken(await jwtFor({ audience: 'other-app' })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects unsigned (alg=none) tokens', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'u-1',
        role: 'ADMIN',
        iss: config.issuer,
        aud: config.audience,
        exp: 4_102_444_800,
      }),
    ).toString('base64url');
    await expect(
      createTokenService(config, () => T0).verifyAccessToken(`${header}.${payload}.`),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects tokens using a different HMAC algorithm than the allowlist', async () => {
    const jwt = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('u-1')
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setExpirationTime(Math.floor(T0.getTime() / 1000) + 600)
      .sign(encode(config.secret));
    await expect(
      createTokenService(config, () => T0).verifyAccessToken(jwt),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a payload that was tampered with after signing', async () => {
    const tokens = createTokenService(config, () => T0);
    const jwt = await tokens.signAccessToken({ userId: 'u-1', role: 'CUSTOMER' });
    const [h, p, s] = jwt.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), role: 'ADMIN' }),
    ).toString('base64url');
    await expect(tokens.verifyAccessToken(`${h}.${forged}.${s}`)).rejects.toBeInstanceOf(AppError);
  });

  it.each(['', 'abc', 'a.b.c', 'Bearer x'])('rejects malformed token %j', async (bad) => {
    await expect(
      createTokenService(config, () => T0).verifyAccessToken(bad),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a validly signed token whose role claim is not a known role', async () => {
    const jwt = await new SignJWT({ role: 'SUPERUSER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-1')
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setExpirationTime(Math.floor(T0.getTime() / 1000) + 600)
      .sign(encode(config.secret));
    await expect(
      createTokenService(config, () => T0).verifyAccessToken(jwt),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('refresh tokens', () => {
  it('are high-entropy, unique, and stored only as a SHA-256 hash', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43); // 256 bits, base64url
    expect(a.hash).toBe(createHash('sha256').update(a.token).digest('hex'));
    expect(a.hash).toHaveLength(64);
  });
});
