import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

const control =
  'min-h-11 w-full rounded-md border bg-paper px-3 text-base text-ink placeholder:text-muted/70 aria-[invalid=true]:border-stop aria-[invalid=true]:bg-[#fdf2f0]';

interface Common {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({
  label,
  error,
  hint,
  className = '',
  ...rest
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`${control} ${error ? 'border-stop' : 'border-line'}`}
        {...rest}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm font-medium text-stop">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  error,
  children,
  className = '',
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`${control} ${error ? 'border-stop' : 'border-line'}`}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm font-medium text-stop">
          {error}
        </p>
      )}
    </div>
  );
}
