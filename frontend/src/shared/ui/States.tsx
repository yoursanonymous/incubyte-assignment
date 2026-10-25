import type { ReactNode } from 'react';
import { Button } from './Button';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-line bg-paper/60 px-6 py-14 text-center">
      <h2 className="font-display text-3xl font-bold">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-stop/40 bg-[#fdf2f0] px-6 py-10 text-center"
    >
      <h2 className="font-display text-3xl font-bold text-stop">Something went wrong</h2>
      <p className="mx-auto mt-2 max-w-md">{message}</p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-stop/40 bg-[#fdf2f0] px-3 py-2 text-sm font-medium text-stop"
    >
      {children}
    </div>
  );
}
