import { Suspense, use, useRef, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import {
  backupFilename,
  backupNote,
  createBackup,
  importBackup,
  type ImportSummary,
} from './backup';
import type { Job } from '@/store/job';
import { jobStore } from '@/store/job-store';
import { downloadFile } from '@/utils/download-file';
import { pluralize } from '@/utils/text';
import { reportFailure } from '@/utils/write-or-report';

const describeImport = ({ added, updated, skipped }: ImportSummary) =>
  `Imported: ${added} added, ${updated} updated, ${skipped} skipped.`;

type NoteProps = {
  /** The backup time read from storage. */
  stored: Promise<string | undefined>;
  /** The time of a backup made since the page opened; it takes over from `stored`. */
  backedUpAt: string | undefined;
  jobCount: number;
};

function BackupNote({ stored, backedUpAt, jobCount }: NoteProps) {
  const note = backupNote(backedUpAt ?? use(stored), jobCount);
  return (
    <span
      data-slot="backup-note"
      data-stale={note.isStale}
      className="text-sm text-muted-foreground data-[stale=true]:font-medium data-[stale=true]:text-warning"
    >
      {note.text}
    </span>
  );
}

/** The "Last backup" note, with buttons to back up every job to a file and to import one. */
export function BackupControls({ jobs }: { jobs: readonly Job[] }) {
  const [stored] = useState(() => jobStore.getLastBackupAt());
  const [backedUpAt, setBackedUpAt] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const handleBackUp = async () => {
    const now = new Date();
    downloadFile(createBackup(jobs, now), backupFilename(now), 'application/json');
    await jobStore.recordBackup(now.toISOString());
    setBackedUpAt(now.toISOString());
    toast.add({ title: `Backed up ${pluralize(jobs.length, 'job')}.` });
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await importBackup(await file.text());
      if (result.isOk) {
        toast.add({ title: describeImport(result.summary) });
      } else {
        // No timeout: the message can be long and the user needs to read it.
        toast.add({
          title: "Couldn't import that file",
          description: result.error,
          type: 'error',
          timeout: 0,
        });
      }
    } catch (error) {
      reportFailure('import that file', error);
    }
    // Lets the same file be chosen again.
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <>
      <Suspense fallback={null}>
        <BackupNote stored={stored} backedUpAt={backedUpAt} jobCount={jobs.length} />
      </Suspense>
      <Button
        variant="outline"
        size="sm"
        disabled={jobs.length === 0}
        onClick={() => void handleBackUp()}
      >
        <Save /> Back up
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
        <RotateCcw /> Import
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Choose a backup file"
        onChange={(event) => void handleImport(event.target.files?.[0])}
      />
    </>
  );
}
