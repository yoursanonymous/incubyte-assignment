import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/infrastructure/logger.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { logger: createLogger('info', stream), output: () => lines.join('') };
}

describe('logger redaction', () => {
  it('redacts passwords, tokens, cookies and authorization headers wherever they appear', () => {
    const { logger, output } = capture();
    logger.info(
      {
        password: 'hunter2-secret',
        body: { password: 'nested-secret', accessToken: 'jwt-abc', refreshToken: 'refresh-xyz' },
        req: {
          headers: {
            authorization: 'Bearer top-secret-token',
            cookie: 'refresh_token=cookie-secret',
          },
        },
        res: { headers: { 'set-cookie': ['refresh_token=set-cookie-secret'] } },
      },
      'sample',
    );
    const text = output();
    for (const secret of [
      'hunter2-secret',
      'nested-secret',
      'jwt-abc',
      'refresh-xyz',
      'top-secret-token',
      'cookie-secret',
      'set-cookie-secret',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[REDACTED]');
  });

  it('emits structured JSON with an ISO timestamp and level', () => {
    const { logger, output } = capture();
    logger.warn({ requestId: 'r-1' }, 'hello');
    const entry = JSON.parse(output());
    expect(entry).toMatchObject({ msg: 'hello', requestId: 'r-1', service: 'dealership-api' });
    expect(entry.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.level).toBe(40);
  });
});
