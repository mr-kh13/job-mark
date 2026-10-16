import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { JobTable } from './columns';
import { JobsTableColumnsMenu } from './jobs-table-columns-menu';
import { JobsTableFiltersDialog } from './jobs-table-filters-dialog';

/** The search box, the Filters button and the Columns menu. They wrap on a narrow screen. */
export function JobsTableToolbar({ table }: { table: JobTable }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search title or company"
          placeholder="Search title or company"
          className="pl-8"
          value={table.state.globalFilter}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
        />
      </div>
      <JobsTableFiltersDialog table={table} />
      <JobsTableColumnsMenu table={table} />
    </div>
  );
}
