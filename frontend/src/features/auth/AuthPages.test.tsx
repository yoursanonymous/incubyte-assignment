import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pageOf, renderApp, sessionFor, vehicle } from '../../test/helpers';

describe('authentication screens', () => {
  it('redirects anonymous visitors to the sign-in page', async () => {
    renderApp('/', {}, { signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows field-level validation without calling the API', async () => {
    const { http } = renderApp('/login', {}, { signedIn: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(http.count('POST /api/auth/login')).toBe(0);
  });

  it('shows the server error for wrong credentials and stays on the page', async () => {
    renderApp(
      '/login',
      {
        'POST /api/auth/login': {
          status: 401,
          body: {
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Invalid email or password.',
              requestId: 'r',
            },
          },
        },
      },
      { signedIn: false },
    );
    await userEvent.type(await screen.findByLabelText('Email'), 'a@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signs in and lands on the inventory', async () => {
    renderApp(
      '/login',
      {
        'POST /api/auth/login': sessionFor(),
        'GET /api/vehicles/search': { body: pageOf([vehicle()]) },
      },
      { signedIn: false },
    );
    await userEvent.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
    expect(await screen.findByText('Corolla')).toBeInTheDocument();
  });

  it('registration enforces the password rules and confirmation locally', async () => {
    const { http } = renderApp('/register', {}, { signedIn: false });
    await userEvent.type(await screen.findByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(http.count('POST /api/auth/register')).toBe(0);
  });

  it('shows a duplicate-email error from the server on the email field', async () => {
    renderApp(
      '/register',
      {
        'POST /api/auth/register': {
          status: 409,
          body: {
            error: {
              code: 'EMAIL_TAKEN',
              message: 'An account with this email already exists.',
              requestId: 'r',
            },
          },
        },
      },
      { signedIn: false },
    );
    await userEvent.type(await screen.findByLabelText('Email'), 'taken@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pass');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'long-enough-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
  });

  it('returns to sign-in when the session expires and cannot be refreshed', async () => {
    let refreshes = 0;
    renderApp('/', {
      'GET /api/vehicles/search': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'expired', requestId: 'r' } },
      },
      'POST /api/auth/refresh': () =>
        ++refreshes === 1
          ? sessionFor()
          : {
              status: 401,
              body: { error: { code: 'UNAUTHENTICATED', message: 'gone', requestId: 'r' } },
            },
    });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await waitFor(() => expect(refreshes).toBe(2));
  });
});
