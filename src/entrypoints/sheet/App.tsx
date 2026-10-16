import { useSyncExternalStore } from 'react';
import { Inbox } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { Inspiration } from '@/components/inspiration/inspiration';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Toaster } from '@/components/ui/toast';
import { useJobs } from '@/hooks/use-jobs';
import { useSettings } from '@/hooks/use-settings';
import { jobRequestFromHash } from '@/utils/open-sheet';
import { pluralize } from '@/utils/text';
import { JobsTable } from './jobs-table/jobs-table';
import { JobsTablePager } from './jobs-table/jobs-table-pager';
import { JobsTableToolbar } from './jobs-table/jobs-table-toolbar';
import { useJobsTable } from './jobs-table/use-jobs-table';
import { AddJobDialog } from './add-job-dialog';
import { BackupControls } from './backup/backup-controls';
import { SettingsDialog } from './settings-dialog';
import { ExportMenu } from './export/export-menu';

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

export default function App() {
  const { jobs, isLoaded } = useJobs();
  const [settings, updateSettings] = useSettings();
  const hash = useSyncExternalStore(subscribeToHash, () => location.hash);
  const { table, rows, focus, page, pageCount, pageSize, total, setPage, setPageSize } =
    useJobsTable(jobs, jobRequestFromHash(hash));

  return (
    <main className="mx-auto max-w-[1500px] p-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h1>
          <BrandLogo className="block h-8 w-auto" />
        </h1>
        {isLoaded && (
          <Badge variant="secondary" className="tabular-nums">
            {total === jobs.length
              ? pluralize(jobs.length, 'job')
              : `${total} of ${pluralize(jobs.length, 'job')}`}
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isLoaded && (
            <>
              <BackupControls jobs={jobs} />
              <ExportMenu jobs={jobs} />
            </>
          )}
          <AddJobDialog />
          <SettingsDialog settings={settings} onChange={updateSettings} />
        </div>
      </header>

      {isLoaded &&
        (jobs.length === 0 ? (
          <Empty className="border py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyDescription>
                Nothing tracked yet. Jobs you save or apply for on a supported site will appear
                here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <JobsTableToolbar table={table} />
            <JobsTable table={table} rows={rows} focus={focus} />
            {total > 0 && (
              <JobsTablePager
                page={page}
                pageCount={pageCount}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </>
        ))}
      {isLoaded && (
        <Inspiration jobs={jobs} isAiEnabled={settings.isAiEnabled} className="mt-6 text-sm" />
      )}
      <Toaster />
    </main>
  );
}
