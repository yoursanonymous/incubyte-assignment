import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../app/App';
import { authSession } from '../shared/api/client';
import type { Page, Role, Vehicle } from '../shared/api/types';
import { mockFetch } from './fetchMock';

export const vehicle = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v-1',
  make: 'Toyota',
  model: 'Corolla',
  category: 'SEDAN',
  price: '21990.00',
  quantity: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export const pageOf = (data: Vehicle[], total = data.length): Page<Vehicle> => ({
  data,
  pagination: { page: 1, pageSize: 12, total, totalPages: Math.max(1, Math.ceil(total / 12)) },
});

export const sessionFor = (role: Role = 'CUSTOMER') => ({
  status: 200,
  body: {
    user: {
      id: 'u-1',
      email: `${role.toLowerCase()}@example.com`,
      role,
      createdAt: '2026-01-01T00:00:00Z',
    },
    accessToken: 'access-1',
    expiresIn: 900,
  },
});

type Routes = Parameters<typeof mockFetch>[0];

/** Renders the whole app at `path`. By default a valid session is restored from the refresh cookie. */
export function renderApp(
  path: string,
  routes: Routes,
  { role = 'CUSTOMER', signedIn = true }: { role?: Role; signedIn?: boolean } = {},
) {
  authSession.setAccessToken(null);
  const http = mockFetch({
    'POST /api/auth/refresh': signedIn
      ? sessionFor(role)
      : {
          status: 401,
          body: { error: { code: 'UNAUTHENTICATED', message: 'No session', requestId: 'r' } },
        },
    ...routes,
  });
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return { ...view, http };
}
