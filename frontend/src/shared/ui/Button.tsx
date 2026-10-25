import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'bg-asphalt text-paper hover:bg-asphalt-2 disabled:bg-line disabled:text-muted',
  secondary:
    'bg-paper text-ink border border-ink/30 hover:border-ink disabled:text-muted disabled:border-line',
  danger: 'bg-stop text-white hover:bg-[#8c2314] disabled:bg-line disabled:text-muted',
  ghost: 'text-ink hover:bg-ink/10 disabled:text-muted',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-[0.95rem] font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
