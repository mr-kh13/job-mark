import { useState } from 'react';
import { Plus } from 'lucide-react';
import { JobForm } from '@/components/job-form/job-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createJob, type NewJob } from '@/store/job';
import { jobStore } from '@/store/job-store';
import { jobHash } from '@/utils/open-sheet';
import { writeOrReport } from '@/utils/write-or-report';

/** The form itself. It mounts only while the dialog is open, so each use gets a fresh id. */
function AddJobFields({ onDone }: { onDone: () => void }) {
  const [id] = useState(() => `manual:${crypto.randomUUID()}`);

  const handleSubmit = async (input: NewJob) => {
    const job = createJob(input, new Date().toISOString());
    if (!(await writeOrReport(jobStore.save(job), 'add the job'))) return;
    // The sheet shows the new job even when a search or filter would hide it.
    location.hash = jobHash(job.id);
    onDone();
  };

  return (
    <JobForm
      jobRef={{ id, source: 'other' }}
      submitLabel="Add job"
      onSubmit={handleSubmit}
      onCancel={onDone}
    />
  );
}

/** An "Add job" button that opens a form for a job entered by hand. */
export function AddJobDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus /> Add job
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a job</DialogTitle>
            <DialogDescription>Enter the details of a job you want to track.</DialogDescription>
          </DialogHeader>
          <AddJobFields onDone={() => setIsOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
