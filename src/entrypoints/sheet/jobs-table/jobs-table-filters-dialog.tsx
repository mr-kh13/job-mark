import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SOURCE_LABELS } from '@/store/job-display';
import { EMPLOYMENT_TYPES, STATUSES, WORK_ARRANGEMENTS } from '@/store/job';
import type { JobTable } from './columns';

type Option = { value: string; label: string };

const named = (values: readonly string[]): Option[] =>
  values.map((value) => ({ value, label: value }));

const FILTERS = [
  { columnId: 'status', label: 'Status', anyLabel: 'Any status', options: named(STATUSES) },
  {
    columnId: 'source',
    label: 'Source',
    anyLabel: 'Any source',
    options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    columnId: 'workArrangement',
    label: 'Work arrangement',
    anyLabel: 'Any arrangement',
    options: named(WORK_ARRANGEMENTS),
  },
  {
    columnId: 'employmentType',
    label: 'Employment type',
    anyLabel: 'Any employment',
    options: named(EMPLOYMENT_TYPES),
  },
];

// Select values are strings, so "any" is the empty string, which also clears the column filter.
const ANY = '';

function FilterSelect({ table, filter }: { table: JobTable; filter: (typeof FILTERS)[number] }) {
  const column = table.getColumn(filter.columnId);
  const items = [{ value: ANY, label: filter.anyLabel }].concat(filter.options);
  const id = `filter-${filter.columnId}`;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{filter.label}</FieldLabel>
      <Select
        value={String(column?.getFilterValue() ?? ANY)}
        items={items}
        onValueChange={(next) => column?.setFilterValue(next ?? ANY)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** A Filters button, with the number of pickers set, that opens the status, source,
 * work arrangement and employment type pickers in a dialog. */
export function JobsTableFiltersDialog({ table }: { table: JobTable }) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerCount = table.state.columnFilters.length;

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <ListFilter /> Filters
        {pickerCount > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {pickerCount}
          </Badge>
        )}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>The table updates as you pick.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-3">
            {FILTERS.map((filter) => (
              <FilterSelect key={filter.columnId} table={table} filter={filter} />
            ))}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => table.resetColumnFilters(true)}>
              Clear filters
            </Button>
            <Button onClick={() => setIsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
