import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import type { Job } from '@/store/job';
import { downloadFile } from '@/utils/download-file';
import { formatDate } from '@/utils/format-date';
import { pluralize } from '@/utils/text';
import { reportFailure } from '@/utils/write-or-report';
import { createCsv } from './csv';
import { createXlsx } from './xlsx';

type ExportFormat = {
  label: string;
  extension: string;
  mimeType: string;
  create: (jobs: readonly Job[]) => BlobPart | Promise<BlobPart>;
};

const FORMATS: readonly ExportFormat[] = [
  { label: 'CSV', extension: 'csv', mimeType: 'text/csv;charset=utf-8', create: createCsv },
  {
    label: 'Excel',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    create: createXlsx,
  },
];

/** A menu that saves every job to a CSV or an Excel file. */
export function ExportMenu({ jobs }: { jobs: readonly Job[] }) {
  const handleExport = async ({ extension, mimeType, create }: ExportFormat) => {
    try {
      const filename = `job-applications-${formatDate(new Date(), 'yyyy-MM-dd')}.${extension}`;
      downloadFile(await create(jobs), filename, mimeType);
      toast.add({ title: `Exported ${pluralize(jobs.length, 'job')}.` });
    } catch (error) {
      reportFailure('export the jobs', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" disabled={jobs.length === 0} />}
      >
        <Download /> Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMATS.map((format) => (
          <DropdownMenuItem key={format.label} onClick={() => void handleExport(format)}>
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
