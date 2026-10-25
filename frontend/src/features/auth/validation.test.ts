import { describe, expect, it } from 'vitest';
import { validateLogin, validateRegister } from './validation';

describe('validateLogin', () => {
  it('accepts a normal login', () => {
    expect(validateLogin({ email: 'a@example.com', password: 'x' })).toEqual({});
  });
  it('requires a well-formed email and a password', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(validateLogin({ email: 'nope', password: 'x' }).email).toMatch(/valid email/i);
  });
});

describe('validateRegister', () => {
  const ok = { email: 'a@example.com', password: 'long-enough-1', confirm: 'long-enough-1' };
  it('accepts valid input', () => expect(validateRegister(ok)).toEqual({}));
  it('enforces the same 10-character minimum as the API', () => {
    expect(validateRegister({ ...ok, password: 'short', confirm: 'short' }).password).toMatch(
      /at least 10/,
    );
  });
  it('enforces the 128-character maximum', () => {
    const long = 'x'.repeat(129);
    expect(validateRegister({ ...ok, password: long, confirm: long }).password).toMatch(
      /at most 128/,
    );
  });
  it('requires matching confirmation', () => {
    expect(validateRegister({ ...ok, confirm: 'different-pass-1' }).confirm).toMatch(/match/i);
  });
});
