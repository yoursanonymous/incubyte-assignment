import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

export type Remote<T> =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/**
 * Loads data with cancellation: a slow earlier response can never overwrite a newer one.
 * `reload` re-runs the fetch; `patch` updates the loaded data locally (e.g. after a purchase).
 */
export function useRemote<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
) {
  const [state, setState] = useState<Remote<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const key = `${JSON.stringify(deps)}:${version}`;

  // When the inputs change, show the loading state immediately (during render, not in an effect).
  const [loadedKey, setLoadedKey] = useState(key);
  if (loadedKey !== key) {
    setLoadedKey(key);
    setState({ status: 'loading' });
  }

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const controller = new AbortController();
    fetcherRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message:
            error instanceof ApiError ? error.message : 'Unexpected error. Please try again.',
        });
      },
    );
    return () => controller.abort();
  }, [key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const patch = useCallback(
    (update: (data: T) => T) =>
      setState((s) => (s.status === 'ready' ? { status: 'ready', data: update(s.data) } : s)),
    [],
  );
  return { state, reload, patch };
}
