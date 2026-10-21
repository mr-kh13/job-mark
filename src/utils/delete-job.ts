import { toast } from '@/components/ui/toast';
import type { Job } from '@/store/job';
import { jobStore } from '@/store/job-store';
import { writeOrReport } from './write-or-report';

const UNDO_MS = 6000;

/**
 * Puts a deleted job back, unless the same job was saved again in the meantime.
 *
 * @param job - The deleted job.
 */
const restoreJob = (job: Job) =>
  writeOrReport(
    jobStore.transaction(async (ops) => {
      if (!(await ops.get(job.id))) await ops.save(job);
    }),
    'restore the job',
  );

/**
 * Deletes a job and offers a few seconds to take it back.
 *
 * @param job - The job to delete.
 */
export async function deleteJob(job: Job): Promise<void> {
  if (!(await writeOrReport(jobStore.remove(job.id), 'delete the job'))) return;
  const toastId = toast.add({
    title: `Deleted “${job.title || 'job'}”`,
    timeout: UNDO_MS,
    actionProps: {
      children: 'Undo',
      onClick: () => {
        void restoreJob(job);
        toast.close(toastId);
      },
    },
  });
}
