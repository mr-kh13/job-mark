import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUSES } from '@/store/job';
import { cleanup, render } from '@/test-utils/render';
import { openSelect, pickOption, selectOptions } from '@/test-utils/select';
import { StatusSelect } from './status-select';

afterEach(cleanup);

const picker = (screen: HTMLElement) => screen.querySelector<HTMLElement>('[role="combobox"]')!;

describe('StatusSelect', () => {
  it('shows the current status under the given label', async () => {
    const screen = await render(
      <StatusSelect value="Interviewing" onValueChange={() => {}} label="Status of Engineer" />,
    );

    expect(picker(screen).textContent).toBe('Interviewing');
    expect(picker(screen).getAttribute('aria-label')).toBe('Status of Engineer');
  });

  it('puts the given id on the picker, so a label can point at it', async () => {
    const screen = await render(
      <StatusSelect id="status" value="Interested" onValueChange={() => {}} label="Status" />,
    );

    expect(picker(screen).id).toBe('status');
  });

  it('looks like a form control by default and blends into a row when ghost', async () => {
    const plain = await render(
      <StatusSelect value="Interested" onValueChange={() => {}} label="Status" />,
    );
    const ghost = await render(
      <StatusSelect variant="ghost" value="Interested" onValueChange={() => {}} label="Status" />,
    );

    expect(picker(plain).dataset.variant).toBe('default');
    expect(picker(ghost).dataset.variant).toBe('ghost');
  });

  it('lists every status in pipeline order', async () => {
    const screen = await render(
      <StatusSelect value="Interested" onValueChange={() => {}} label="Status" />,
    );

    await openSelect(picker(screen));

    expect(selectOptions().map((option) => option.textContent)).toEqual(Array.from(STATUSES));
  });

  it('reports the status that was picked', async () => {
    const onValueChange = vi.fn();
    const screen = await render(
      <StatusSelect value="Interested" onValueChange={onValueChange} label="Status" />,
    );
    await openSelect(picker(screen));

    await pickOption('Offer');

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('Offer');
  });
});
