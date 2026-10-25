import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { TextField } from '../../shared/ui/Field';
import { Alert } from '../../shared/ui/States';
import { validateLogin, validateRegister, type FieldErrors } from './validation';

function Shell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-[1fr_26rem] md:py-20">
      <section aria-hidden="true" className="hidden md:block">
        <p className="font-display text-7xl font-bold uppercase leading-[0.9]">
          Every unit
          <br />
          on the lot,
          <br />
          <span className="bg-paint px-2">live.</span>
        </p>
        <p className="mt-6 max-w-sm text-lg text-muted">
          Browse real-time stock, filter by price and body style, and buy in a couple of taps.
        </p>
      </section>
      <section className="rounded-lg border border-line bg-paper p-6 shadow-sm">
        <h1 className="font-display text-4xl font-bold leading-none">{title}</h1>
        <p className="mt-2 text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-6 text-sm text-muted">{footer}</p>
      </section>
    </div>
  );
}

function useAuthForm<K extends string>(
  validate: (values: Record<string, string>) => FieldErrors<K>,
  submit: (values: Record<string, string>) => Promise<void>,
) {
  const [errors, setErrors] = useState<FieldErrors<K>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<
      string,
      string
    >;
    const found = validate(values);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await submit(values);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN')
        setErrors({ email: error.message } as FieldErrors<K>);
      else
        setServerError(
          error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
        );
    } finally {
      setBusy(false);
    }
  }
  return { errors, serverError, busy, onSubmit };
}

export function LoginPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const form = useAuthForm(
    (v) => validateLogin({ email: v.email ?? '', password: v.password ?? '' }),
    async (v) => {
      await login(v.email!.trim(), v.password!);
      navigate(from, { replace: true });
    },
  );
  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  return (
    <Shell
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New here?{' '}
          <Link className="font-semibold text-ink underline" to="/register">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void form.onSubmit(e)} noValidate className="space-y-4">
        {form.serverError && <Alert>{form.serverError}</Alert>}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={form.errors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          error={form.errors.password}
        />
        <Button type="submit" busy={form.busy} className="w-full">
          Sign in
        </Button>
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const { state, register } = useAuth();
  const navigate = useNavigate();
  const form = useAuthForm(
    (v) =>
      validateRegister({
        email: v.email ?? '',
        password: v.password ?? '',
        confirm: v.confirm ?? '',
      }),
    async (v) => {
      await register(v.email!.trim(), v.password!);
      navigate('/', { replace: true });
    },
  );
  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  return (
    <Shell
      title="Create account"
      subtitle="Customer accounts can browse and purchase."
      footer={
        <>
          Already registered?{' '}
          <Link className="font-semibold text-ink underline" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void form.onSubmit(e)} noValidate className="space-y-4">
        {form.serverError && <Alert>{form.serverError}</Alert>}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={form.errors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          error={form.errors.password}
        />
        <TextField
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          error={form.errors.confirm}
        />
        <Button type="submit" busy={form.busy} className="w-full">
          Create account
        </Button>
      </form>
    </Shell>
  );
}
