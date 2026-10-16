import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZES } from './use-jobs-table';

type Props = {
  page: number;
  pageCount: number;
  pageSize: number;
  /** How many jobs match, across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

/** The rows-per-page picker, the range of jobs on show and the Previous and Next buttons. */
export function JobsTablePager({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        Rows per page
        <Select
          value={String(pageSize)}
          onValueChange={(next) => next && onPageSizeChange(Number(next))}
        >
          <SelectTrigger size="sm" aria-label="Rows per page" className="w-[4.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="tabular-nums">{`${first}–${last} of ${total}`}</span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
