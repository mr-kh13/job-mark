import { differenceInDays } from 'date-fns';
import { z } from 'zod';
import { formatDate, formatTimeAgo } from '@/utils/format-date';
import { Job, SCHEMA_VERSION } from '@/store/job';
import { jobStore } from '@/store/job-store';

const BACKUP_APP = 'jobmark';
const STALE_AFTER_DAYS = 30;
const MAX_PROBLEMS_SHOWN = 3;

const Header = z.object({ app: z.literal(BACKUP_APP) });
const Body = z.object({ schemaVersion: z.number(), jobs: z.array(z.unknown()) });

/** What an import changed. */
export type ImportSummary = { added: number; updated: number; skipped: number };

type Failure = { isOk: false; error: string };
type ParsedBackup = { isOk: true; jobs: Job[] } | Failure;
/** The outcome of an import: what changed, or why nothing did. */
export type ImportResult = { isOk: true; summary: ImportSummary } | Failure;

/**
 * Writes a backup file: every job, in a stable shape that `parseBackup` reads back.
 *
 * @param jobs - The jobs to back up.
 * @param now - The export time.
 * @returns The file's text.
 */
export function createBackup(jobs: readonly Job[], now: Date = new Date()): string {
  return JSON.stringify(
    { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), jobs },
    null,
    2,
  );
}

/**
 * Names a backup file after the local date.
 *
 * @param now - The export time.
 * @returns The file name.
 */
export const backupFilename = (now: Date = new Date()): string =>
  `jobmark-backup-${formatDate(now, 'yyyy-MM-dd')}.json`;

const describeProblem = (index: number, issue: z.core.$ZodIssue | undefined) =>
  `#${index + 1}: ${issue?.path.join('.') || 'record'} ${issue?.message ?? 'is invalid'}`;

/**
 * Checks a backup file without writing anything. One invalid job rejects the whole file, so a
 * damaged file can never be half applied.
 *
 * @param text - The file's text.
 * @returns The jobs in the file, or the reason it was rejected.
 */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { isOk: false, error: "That file isn't valid JSON." };
  }
  if (!Header.safeParse(data).success) {
    return { isOk: false, error: "That isn't a Jobmark backup file." };
  }
  const body = Body.safeParse(data);
  if (!body.success) {
    return { isOk: false, error: 'The backup file is missing its version or job list.' };
  }
  if (body.data.schemaVersion > SCHEMA_VERSION) {
    return {
      isOk: false,
      error: 'This backup was made by a newer version of Jobmark. Update the extension first.',
    };
  }

  const jobs: Job[] = [];
  const problems: string[] = [];
  for (const [index, raw] of body.data.jobs.entries()) {
    const parsed = Job.safeParse(raw);
    if (parsed.success) jobs.push(parsed.data);
    else problems.push(describeProblem(index, parsed.error.issues[0]));
  }
  if (problems.length > 0) {
    const count = `${problems.length} invalid ${problems.length === 1 ? 'record' : 'records'}`;
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN).join('; ');
    const more =
      problems.length > MAX_PROBLEMS_SHOWN
        ? ` (and ${problems.length - MAX_PROBLEMS_SHOWN} more)`
        : '';
    return { isOk: false, error: `${count}, nothing was imported. ${shown}${more}` };
  }
  return { isOk: true, jobs };
}

const isNewer = (a: Job, b: Job) => Date.parse(a.updatedAt) > Date.parse(b.updatedAt);

/**
 * Decides what an import changes. Jobs merge by id and the newer `updatedAt` wins; an equal or
 * older job in the file is skipped. A file that lists an id twice counts its newest copy.
 *
 * @param existing - The jobs already stored.
 * @param incoming - The jobs in the file.
 * @returns The jobs to write, and how many were added, updated and skipped.
 */
export function planImport(
  existing: readonly Job[],
  incoming: readonly Job[],
): { toWrite: Job[]; summary: ImportSummary } {
  const current = new Map(existing.map((job) => [job.id, job]));
  const newest = new Map<string, Job>();
  for (const job of incoming) {
    const seen = newest.get(job.id);
    if (!seen || isNewer(job, seen)) newest.set(job.id, job);
  }

  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0 };
  const toWrite: Job[] = [];
  for (const job of newest.values()) {
    const local = current.get(job.id);
    if (!local) {
      summary.added++;
      toWrite.push(job);
    } else if (isNewer(job, local)) {
      summary.updated++;
      toWrite.push(job);
    } else {
      summary.skipped++;
    }
  }
  return { toWrite, summary };
}

/**
 * Merges a backup file into the store. Nothing is written unless the whole file is valid, and the
 * read and the write happen under one lock so no other write slips in between.
 *
 * @param text - The file's text.
 * @returns What changed, or why the file was rejected.
 */
export async function importBackup(text: string): Promise<ImportResult> {
  const parsed = parseBackup(text);
  if (!parsed.isOk) return parsed;
  return jobStore.transaction(async (ops): Promise<ImportResult> => {
    const { toWrite, summary } = planImport(await ops.list(), parsed.jobs);
    if (toWrite.length > 0) await ops.saveMany(toWrite);
    return { isOk: true, summary };
  });
}

/**
 * The "Last backup" note, and whether to ask for a backup: there are jobs and either none was
 * ever made or the last one is 30 or more days old.
 *
 * @param lastBackupAt - ISO time of the last backup, if any.
 * @param jobCount - How many jobs are tracked.
 * @param now - The current time.
 * @returns The note's text, and whether it should be shown as a warning.
 */
export function backupNote(
  lastBackupAt: string | undefined,
  jobCount: number,
  now: Date = new Date(),
): { text: string; isStale: boolean } {
  if (!lastBackupAt) return { text: 'Last backup: never', isStale: jobCount > 0 };
  const days = differenceInDays(now, Date.parse(lastBackupAt));
  return {
    text: `Last backup: ${formatTimeAgo(lastBackupAt, now)}`,
    isStale: days >= STALE_AFTER_DAYS && jobCount > 0,
  };
}
