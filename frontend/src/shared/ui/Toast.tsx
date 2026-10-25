import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  text: string;
}
const ToastContext = createContext<(kind: ToastItem['kind'], text: string) => void>(
  () => undefined,
);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, kind, text }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 6000);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border-l-4 bg-asphalt px-4 py-3 text-paper shadow-lg ${t.kind === 'success' ? 'border-paint' : 'border-stop'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
