import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORK_ARRANGEMENTS } from '@/store/job';
import { cleanup, render } from '@/test-utils/render';
import { openSelect, pickOption, selectOptions } from '@/test-utils/select';
import { OptionSelect } from './option-select';

afterEach(cleanup);

const picker = (screen: HTMLElement) => screen.querySelector<HTMLElement>('[role="combobox"]')!;

describe('OptionSelect', () => {
  it('shows the current value under the given label', async () => {
    const screen = await render(
      <OptionSelect
        options={WORK_ARRANGEMENTS}
        value="Hybrid"
        onValueChange={() => {}}
        label="Arrangement of Engineer"
      />,
    );

    expect(picker(screen).textContent).toBe('Hybrid');
    expect(picker(screen).getAttribute('aria-label')).toBe('Arrangement of Engineer');
  });

  it('puts the given id on the picker, so a label can point at it', async () => {
    const screen = await render(
      <OptionSelect
        id="arrangement"
        options={WORK_ARRANGEMENTS}
        value="Hybrid"
        onValueChange={() => {}}
        label="Arrangement"
      />,
    );

    expect(picker(screen).id).toBe('arrangement');
  });

  it('looks like a form control by default and blends into a row when ghost', async () => {
    const plain = await render(
      <OptionSelect
        options={WORK_ARRANGEMENTS}
        value="Hybrid"
        onValueChange={() => {}}
        label="Arrangement"
      />,
    );
    const ghost = await render(
      <OptionSelect
        variant="ghost"
        options={WORK_ARRANGEMENTS}
        value="Hybrid"
        onValueChange={() => {}}
        label="Arrangement"
      />,
    );

    expect(picker(plain).dataset.variant).toBe('default');
    expect(picker(ghost).dataset.variant).toBe('ghost');
  });

  it('shows a dash when nothing is set', async () => {
    const screen = await render(
      <OptionSelect
        options={WORK_ARRANGEMENTS}
        value={undefined}
        onValueChange={() => {}}
        label="Arrangement"
      />,
    );

    expect(picker(screen).textContent).toBe('-');
  });

  it('lists “Not set” first and then the options in order', async () => {
    const screen = await render(
      <OptionSelect
        options={WORK_ARRANGEMENTS}
        value="Remote"
        onValueChange={() => {}}
        label="Arrangement"
      />,
    );

    await openSelect(picker(screen));

    expect(selectOptions().map((option) => option.textContent)).toEqual([
      'Not set',
      'On-site',
      'Hybrid',
      'Remote',
    ]);
  });

  it('reports the option that was picked', async () => {
    const onValueChange = vi.fn();
    const screen = await render(
      <OptionSelect
        options={WORK_ARRANGEMENTS}
        value={undefined}
        onValueChange={onValueChange}
        label="Arrangement"
      />,
    );
    await openSelect(picker(screen));

    await pickOption('Hybrid');

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('Hybrid');
  });

  it('reports undefined when “Not set” is picked', async () => {
    const onValueChange = vi.fn();
    const screen = await render(
      <OptionSelect
        options={WORK_ARRANGEMENTS}
        value="Remote"
        onValueChange={onValueChange}
        label="Arrangement"
      />,
    );
    await openSelect(picker(screen));

    await pickOption('Not set');

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
