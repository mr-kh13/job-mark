import { applyPatch, createJob } from '@/store/job';
import { jobStore } from '@/store/job-store';
import type { CapturedJob, ClickKind, ClickResult } from '@/messages/click';
import { parseWorkType } from '@/sites/job-fields';

/**
 * Handles one Save or Apply click on a job site:
 * - untracked job: create it (Interested for Save, Applied for Apply)
 * - Apply on an Interested job: upgrade the same job, keeping the user's edits
 * - anything else: duplicate, nothing is written
 *
 * @param click.kind - The button that was clicked.
 * @param click.job - The job read from the page.
 * @param click.clickedAt - ISO time of the click; becomes `savedAt`, `appliedAt` and `updatedAt`.
 * @returns The outcome and the resulting job.
 * @throws If the resulting job is invalid; nothing is written.
 */
export function handleClick(click: {
  kind: ClickKind;
  job: CapturedJob;
  clickedAt: string;
}): Promise<ClickResult> {
  const { kind, job, clickedAt } = click;
  return jobStore.transaction(async (ops): Promise<ClickResult> => {
    const existing = await ops.get(job.id);

    if (!existing) {
      const { workArrangement, employmentType } = parseWorkType(job.workType);
      const created = createJob(
        {
          id: job.id,
          source: job.source,
          title: job.title,
          company: job.company,
          location: job.location,
          workArrangement,
          employmentType,
          salary: job.salary,
          applyType: job.applyType,
          url: job.url,
          status: kind === 'apply' ? 'Applied' : 'Interested',
        },
        clickedAt,
      );
      return { outcome: 'saved', job: await ops.save(created) };
    }

    if (kind === 'apply' && existing.status === 'Interested') {
      const upgraded = applyPatch(
        existing,
        {
          applyType: existing.applyType === 'unknown' ? job.applyType : existing.applyType,
          appliedAt: clickedAt,
          status: 'Applied',
        },
        clickedAt,
      );
      return { outcome: 'upgraded', job: await ops.save(upgraded) };
    }

    return { outcome: 'duplicate', job: existing };
  });
}
