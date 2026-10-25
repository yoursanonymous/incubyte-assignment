import { NavLink, Outlet } from 'react-router-dom';
import { Button } from '../shared/ui/Button';
import { useAuth } from './AuthProvider';

const link = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-[0.95rem] font-semibold ${isActive ? 'bg-paint text-ink' : 'text-paper/85 hover:bg-paper/10'}`;

export function Layout() {
  const { state, logout } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-paper focus:p-2"
      >
        Skip to content
      </a>
      <header className="bg-asphalt text-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink
            to="/"
            className="flex items-center gap-2 font-display text-3xl font-bold leading-none tracking-wide"
            aria-label="Lotline home"
          >
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
              <path
                d="M9 26V6m14 20V6M9 16h14"
                stroke="var(--color-paint)"
                strokeWidth="3.5"
                fill="none"
              />
            </svg>
            Lotline
          </NavLink>
          {user && (
            <nav
              aria-label="Main"
              className="order-last flex w-full items-center gap-1 sm:order-none sm:w-auto sm:flex-1"
            >
              <NavLink to="/" end className={link}>
                Inventory
              </NavLink>
              <NavLink to="/orders" className={link}>
                My orders
              </NavLink>
              {user.role === 'ADMIN' && (
                <NavLink to="/admin" className={link}>
                  Manage
                </NavLink>
              )}
            </nav>
          )}
          {user && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="hidden sm:inline" title={user.email}>
                {user.email}{' '}
                {user.role === 'ADMIN' && (
                  <span className="ml-1 rounded bg-paint px-1.5 py-0.5 text-xs font-bold text-ink">
                    STAFF
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                className="!text-paper hover:!bg-paper/10"
                onClick={() => void logout()}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
        <div
          aria-hidden="true"
          className="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-paint)_0_28px,transparent_28px_44px)]"
        />
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        Lotline inventory · prices in USD
      </footer>
    </div>
  );
}
