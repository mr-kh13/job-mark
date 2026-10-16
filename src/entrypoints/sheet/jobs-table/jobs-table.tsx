import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/utils/cn';
import type { JobRequest } from '@/utils/open-sheet';
import type { JobTable, JobTableRow } from './columns';

const SORT_ICONS = { asc: ArrowUp, desc: ArrowDown } as const;
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;
const HIGHLIGHT = 'color-mix(in oklab, var(--primary) 25%, transparent)';
const HIGHLIGHT_MS = 2000;

function showRow(row: HTMLTableRowElement | null) {
  row?.scrollIntoView({ block: 'center' });
  row?.animate({ backgroundColor: [HIGHLIGHT, 'transparent'] }, { duration: HIGHLIGHT_MS });
}

/**
 * The rows of one page in a table. A header with a sort turns into a button, and a job flagged
 * `needsReview` gets a highlighted row. The text, pickers and notes edit in place.
 *
 * The row of the job in focus scrolls into view and flashes.
 */
export function JobsTable({
  table,
  rows,
  focus,
}: {
  table: JobTable;
  rows: JobTableRow[];
  focus?: JobRequest;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const SortIcon = sorted ? SORT_ICONS[sorted] : ChevronsUpDown;
                return (
                  <TableHead key={header.id} aria-sort={sorted ? ARIA_SORT[sorted] : undefined}>
                    {header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-7 px-2 font-medium"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        <SortIcon className={cn(!sorted && 'opacity-40')} />
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              // A repeat request for the job gets a new key, so its row appears again and shows again.
              key={row.id === focus?.id ? `${row.id}:${focus.token}` : row.id}
              ref={row.id === focus?.id ? showRow : undefined}
              data-needs-review={row.original.needsReview}
              className="data-[needs-review=true]:bg-review data-[needs-review=true]:hover:bg-review"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="py-10 text-center text-muted-foreground"
              >
                No jobs match these filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
