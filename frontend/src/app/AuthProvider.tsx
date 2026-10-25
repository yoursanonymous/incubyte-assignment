import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authSession, refreshSession } from '../shared/api/client';
import type { Session, User } from '../shared/api/types';
import { authApi } from '../features/auth/authApi';

type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: User };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const accept = useCallback((session: Session) => {
    authSession.setAccessToken(session.accessToken);
    setState({ status: 'authenticated', user: session.user });
  }, []);

  useEffect(() => {
    authSession.setOnAuthFailure(() => setState({ status: 'anonymous' }));
    let cancelled = false;
    // Restore a session from the HttpOnly refresh cookie; the access token is never stored.
    void refreshSession().then((session) => {
      if (cancelled) return;
      if (session) accept(session);
      else setState({ status: 'anonymous' });
    });
    return () => {
      cancelled = true;
      authSession.setOnAuthFailure(null);
    };
  }, [accept]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (email, password) => accept(await authApi.login(email, password)),
      register: async (email, password) => accept(await authApi.register(email, password)),
      logout: async () => {
        await authApi.logout().catch(() => undefined); // always sign out locally, even if the call fails
        authSession.setAccessToken(null);
        setState({ status: 'anonymous' });
      },
    }),
    [state, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
