import type { Pagination as P } from '../api/types';
import { Button } from './Button';

export function PaginationBar({
  pagination,
  onPage,
}: {
  pagination: P;
  onPage: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-3">
      <Button
        variant="secondary"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
      >
        Previous
      </Button>
      <p className="text-sm text-muted" aria-live="polite">
        Page {pagination.page} of {pagination.totalPages}
      </p>
      <Button
        variant="secondary"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPage(pagination.page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
