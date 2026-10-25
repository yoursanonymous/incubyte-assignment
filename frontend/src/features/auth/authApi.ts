import { apiFetch } from '../../shared/api/client';
import type { Session } from '../../shared/api/types';

export const authApi = {
  register: (email: string, password: string) =>
    apiFetch<Session>('/api/auth/register', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
  login: (email: string, password: string) =>
    apiFetch<Session>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
  logout: () => apiFetch<void>('/api/auth/logout', { method: 'POST', auth: false }),
};
