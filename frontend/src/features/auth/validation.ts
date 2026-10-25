export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailError(email: string): string | undefined {
  if (!email.trim()) return 'Enter your email address.';
  if (!EMAIL.test(email.trim()) || email.length > 254) return 'Enter a valid email address.';
  return undefined;
}

/** Client-side checks give fast feedback only; the API re-validates everything. */
export function validateLogin(v: {
  email: string;
  password: string;
}): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  const email = emailError(v.email);
  if (email) errors.email = email;
  if (!v.password) errors.password = 'Enter your password.';
  return errors;
}

export function validateRegister(v: {
  email: string;
  password: string;
  confirm: string;
}): FieldErrors<'email' | 'password' | 'confirm'> {
  const errors: FieldErrors<'email' | 'password' | 'confirm'> = {};
  const email = emailError(v.email);
  if (email) errors.email = email;
  if (v.password.length < 10) errors.password = 'Use at least 10 characters.';
  else if (v.password.length > 128) errors.password = 'Use at most 128 characters.';
  if (v.confirm !== v.password) errors.confirm = 'Passwords do not match.';
  return errors;
}
