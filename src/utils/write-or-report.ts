import { toast } from '@/components/ui/toast';

const STORAGE_FULL =
  'The storage Chrome gives Jobmark is full. Back up your jobs, then delete some to make room.';

// Chrome words a full storage as "Resource::kQuotaBytes quota exceeded".
function describe(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  return /quota/i.test(error.message) ? STORAGE_FULL : error.message;
}

/**
 * Logs a failure and shows it in an error toast that stays until it is dismissed.
 *
 * @param what - What could not be done, such as "save the change".
 * @param error - What was thrown.
 */
export function reportFailure(what: string, error: unknown): void {
  console.warn(`Could not ${what}`, error);
  toast.add({
    title: `Couldn't ${what}`,
    description: describe(error),
    type: 'error',
    timeout: 0,
  });
}

/**
 * Waits for a write the user asked for. A failure is reported with `reportFailure` and never
 * thrown.
 *
 * @param write - The write in progress.
 * @param what - What the write does, such as "save the change".
 * @returns Whether the write succeeded.
 */
export async function writeOrReport(write: Promise<unknown>, what: string): Promise<boolean> {
  try {
    await write;
    return true;
  } catch (error) {
    reportFailure(what, error);
    return false;
  }
}
