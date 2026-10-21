import { useState } from 'react';
import { ArrowLeft, ExternalLink, Plus, Table2, Trash2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { Inspiration } from '@/components/inspiration/inspiration';
import { JobForm } from '@/components/job-form/job-form';
import { StatusSelect } from '@/components/status-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Toaster, toast } from '@/components/ui/toast';
import { useJobs } from '@/hooks/use-jobs';
import { useSettings } from '@/hooks/use-settings';
import { createJob, listedAt, type Job, type NewJob, type Status } from '@/store/job';
import { jobStore } from '@/store/job-store';
import { deleteJob } from '@/utils/delete-job';
import { formatTimeAgo } from '@/utils/format-date';
import { summarize } from '@/store/job-stats';
import { openSheet } from '@/utils/open-sheet';
import { writeOrReport } from '@/utils/write-or-report';
import { createDraft, findExisting, snapshotActiveTab, type Draft } from './job-draft';

const RECENT_COUNT = 5;

type View =
  | { kind: 'home'; error?: string }
  | { kind: 'form'; draft: Draft; isReadable: boolean }
  | { kind: 'tracked'; job: Job };

const describeJob = (job: Job) =>
  [job.title || 'Untitled job', job.company && `at ${job.company}`].filter(Boolean).join(' ');

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div data-slot="stat" className="rounded-lg border bg-card p-3 text-center">
      <div className="text-2xl leading-none font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function RecentJob({ job }: { job: Job }) {
  const title = job.title || 'Untitled';
  const handleStatusChange = (status: Status) =>
    void writeOrReport(jobStore.changeStatus(job.id, status), 'change the status');

  return (
    <li data-slot="recent-job" className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        {job.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1 text-sm font-medium hover:underline"
          >
            <span data-slot="title" className="truncate">
              {title}
            </span>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </a>
        ) : (
          <span data-slot="title" className="block truncate text-sm font-medium">
            {title}
          </span>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {[job.company, formatTimeAgo(listedAt(job))].filter(Boolean).join(' · ')}
        </p>
      </div>
      <StatusSelect
        label={`Status for ${title}`}
        value={job.status}
        onValueChange={handleStatusChange}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${title}`}
        onClick={() => void deleteJob(job)}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

type HomeViewProps = {
  jobs: readonly Job[];
  isLoaded: boolean;
  error?: string;
  onSave: () => void;
  onOpenSheet: () => void;
};

function HomeView({ jobs, isLoaded, error, onSave, onOpenSheet }: HomeViewProps) {
  const [settings] = useSettings();
  const totals = summarize(jobs);
  const latest = jobs
    .toSorted((a, b) => Date.parse(listedAt(b)) - Date.parse(listedAt(a)))
    .slice(0, RECENT_COUNT);

  return (
    <main className="p-4">
      <h1 className="mb-3">
        <BrandLogo className="block h-6 w-auto" />
      </h1>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat value={totals.applications} label="Applications" />
        <Stat value={totals.thisWeek} label="This week" />
        <Stat value={totals.bestWeek} label="Best week" />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onSave}>
          <Plus /> Save this job
        </Button>
        <Button variant="outline" onClick={onOpenSheet}>
          <Table2 /> Open sheet
        </Button>
      </div>
      <h2 className="mt-5 mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Recent
      </h2>
      {isLoaded && latest.length === 0 ? (
        <Empty className="p-4">
          <EmptyHeader>
            <EmptyDescription>
              Nothing yet. Jobs you save or apply for will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="-mx-1">
          {latest.map((job) => (
            <RecentJob key={job.id} job={job} />
          ))}
        </ul>
      )}
      {isLoaded && (
        <Inspiration jobs={jobs} isAiEnabled={settings.isAiEnabled} className="mt-4 text-xs" />
      )}
    </main>
  );
}

type FormViewProps = { draft: Draft; isReadable: boolean; onDone: () => void };

function FormView({ draft, isReadable, onDone }: FormViewProps) {
  const handleSubmit = async (input: NewJob) => {
    const job = createJob(input, new Date().toISOString());
    if (!(await writeOrReport(jobStore.save(job), 'save the job'))) return;
    toast.add({ title: `Saved: ${input.title}` });
    onDone();
  };

  return (
    <main className="p-4">
      <h1 className="mb-3 text-base font-semibold">Save this job</h1>
      {!isReadable && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>Couldn't read this page. Fill in the details.</AlertDescription>
        </Alert>
      )}
      <JobForm jobRef={draft} defaultValues={draft} onSubmit={handleSubmit} onCancel={onDone} />
    </main>
  );
}

type TrackedViewProps = { job: Job; onShowInSheet: () => void; onBack: () => void };

function TrackedView({ job, onShowInSheet, onBack }: TrackedViewProps) {
  return (
    <main className="grid gap-3 p-4">
      <Alert role="status">
        <AlertTitle>Already tracked</AlertTitle>
        <AlertDescription>
          <p>{describeJob(job)}</p>
          <p>
            {job.status}, listed {formatTimeAgo(listedAt(job))}
          </p>
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onShowInSheet}>
          <Table2 /> Show in sheet
        </Button>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      </div>
    </main>
  );
}

export default function App() {
  const { jobs, isLoaded } = useJobs();
  const [view, setView] = useState<View>({ kind: 'home' });

  const handleBack = () => setView({ kind: 'home' });

  const handleSave = async () => {
    const page = await snapshotActiveTab();
    if (!page) {
      setView({ kind: 'home', error: "Can't see the current tab." });
      return;
    }
    const draft = createDraft(page.snapshot, crypto.randomUUID(), page.job);
    const existing = findExisting(jobs, draft);
    setView(
      existing
        ? { kind: 'tracked', job: existing }
        : { kind: 'form', draft, isReadable: page.isReadable },
    );
  };

  const handleOpenSheet = async (jobId?: string) => {
    try {
      await openSheet(jobId);
      window.close();
    } catch (error) {
      console.error('Failed to open the sheet', error);
      setView({ kind: 'home', error: "Couldn't open the sheet." });
    }
  };

  return (
    <>
      <Toaster />
      {view.kind === 'home' && (
        <HomeView
          jobs={jobs}
          isLoaded={isLoaded}
          error={view.error}
          onSave={() => void handleSave()}
          onOpenSheet={() => void handleOpenSheet()}
        />
      )}
      {view.kind === 'form' && (
        <FormView draft={view.draft} isReadable={view.isReadable} onDone={handleBack} />
      )}
      {view.kind === 'tracked' && (
        <TrackedView
          job={view.job}
          onShowInSheet={() => void handleOpenSheet(view.job.id)}
          onBack={handleBack}
        />
      )}
    </>
  );
}
