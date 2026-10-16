import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobStore } from '@/store/job-store';
import { buttonNamed, fieldFor } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { typeInto } from '@/test-utils/text-field';
import { jobRequestFromHash } from '@/utils/open-sheet';
import { AddJobDialog } from './add-job-dialog';

beforeEach(() => {
  fakeBrowser.reset();
  // Drops any hash without firing a hashchange.
  history.replaceState(null, '', location.pathname);
});

afterEach(cleanup);

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

const openDialog = (screen: HTMLElement) => settle(() => buttonNamed(screen, 'Add job').click());

const fill = async (title: string, company: string) => {
  await typeInto(fieldFor(dialog()!, 'Title'), title);
  await typeInto(fieldFor(dialog()!, 'Company'), company);
};

const submit = () => settle(() => buttonNamed(dialog()!, 'Add job').click());

describe('AddJobDialog', () => {
  it('shows only the Add job button until it is clicked', async () => {
    const screen = await render(<AddJobDialog />);

    expect(buttonNamed(screen, 'Add job')).toBeDefined();
    expect(dialog()).toBeNull();
  });

  it('opens a dialog that says what it is for', async () => {
    const screen = await render(<AddJobDialog />);

    await openDialog(screen);

    expect(dialog()?.textContent).toContain('Add a job');
    expect(dialog()?.textContent).toContain('Enter the details of a job you want to track.');
  });

  it('saves the job under a new manual id and closes', async () => {
    const screen = await render(<AddJobDialog />);
    await openDialog(screen);
    await fill('Platform Engineer', 'Acme');

    await submit();

    await vi.waitFor(async () => expect(await jobStore.list()).toHaveLength(1));
    const [job] = await jobStore.list();
    expect(job).toMatchObject({
      source: 'other',
      title: 'Platform Engineer',
      company: 'Acme',
      status: 'Applied',
      applyType: 'unknown',
      needsReview: false,
    });
    expect(job?.id).toMatch(/^manual:.+/);
    expect(job?.appliedAt).toBe(job?.savedAt);
    await vi.waitFor(() => expect(dialog()).toBeNull());
  });

  it('asks the sheet to show the job it added', async () => {
    const screen = await render(<AddJobDialog />);
    await openDialog(screen);
    await fill('Platform Engineer', 'Acme');

    await submit();

    await vi.waitFor(() => expect(location.hash).not.toBe(''));
    const [job] = await jobStore.list();
    expect(jobRequestFromHash(location.hash)?.id).toBe(job?.id);
  });

  it('leaves the address alone when Cancel is clicked', async () => {
    const screen = await render(<AddJobDialog />);
    await openDialog(screen);
    await fill('Platform Engineer', 'Acme');

    await settle(() => buttonNamed(dialog()!, 'Cancel').click());

    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(location.hash).toBe('');
  });

  it('leaves the address alone while a required field is missing', async () => {
    const screen = await render(<AddJobDialog />);
    await openDialog(screen);
    await typeInto(fieldFor(dialog()!, 'Company'), 'Acme');

    await submit();

    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Add the job title.'));
    expect(location.hash).toBe('');
  });

  it('closes without saving when Cancel is clicked', async () => {
    const screen = await render(<AddJobDialog />);
    await openDialog(screen);
    await fill('Platform Engineer', 'Acme');

    await settle(() => buttonNamed(dialog()!, 'Cancel').click());

    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(await jobStore.list()).toEqual([]);
  });

  it('stays open and saves nothing while a required field is missing', async () => {
    const screen = await render(<AddJobDialog />);
    await openDialog(screen);
    await typeInto(fieldFor(dialog()!, 'Company'), 'Acme');

    await submit();

    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Add the job title.'));
    expect(await jobStore.list()).toEqual([]);
  });

  it('gives every added job its own id', async () => {
    const screen = await render(<AddJobDialog />);
    for (const title of ['First', 'Second']) {
      await openDialog(screen);
      await fill(title, 'Acme');
      await submit();
      await vi.waitFor(() => expect(dialog()).toBeNull());
    }

    const jobs = await jobStore.list();

    expect(jobs.map((job) => job.title).sort()).toEqual(['First', 'Second']);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(2);
  });

  it('opens with an empty form each time', async () => {
    const screen = await render(<AddJobDialog />);
    await openDialog(screen);
    await fill('Platform Engineer', 'Acme');
    await settle(() => buttonNamed(dialog()!, 'Cancel').click());
    await vi.waitFor(() => expect(dialog()).toBeNull());

    await openDialog(screen);

    expect(fieldFor(dialog()!, 'Title').value).toBe('');
    expect(fieldFor(dialog()!, 'Company').value).toBe('');
  });
});
