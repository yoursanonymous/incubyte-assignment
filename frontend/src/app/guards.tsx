import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { EmptyState, Skeleton } from '../shared/ui/States';

export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading')
    return (
      <div className="mx-auto max-w-6xl p-8" aria-busy="true">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  if (state.status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** UX only: the API independently rejects non-admins with 403. */
export function RequireAdmin() {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;
  if (state.user.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState
          title="Staff only"
          action={
            <Link className="font-semibold underline" to="/">
              Back to inventory
            </Link>
          }
        >
          You need an administrator account to manage inventory.
        </EmptyState>
      </div>
    );
  }
  return <Outlet />;
}
