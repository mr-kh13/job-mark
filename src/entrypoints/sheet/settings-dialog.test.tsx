import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldFor } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { SettingsDialog } from './settings-dialog';

afterEach(cleanup);

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

const settingsButton = (screen: HTMLElement) =>
  screen.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!;

const openDialog = (screen: HTMLElement) => settle(() => settingsButton(screen).click());

const AI_SWITCH = 'Write the daily line with on-device AI';

describe('SettingsDialog', () => {
  it('shows only a Settings button until it is clicked', async () => {
    const screen = await render(
      <SettingsDialog settings={{ isAiEnabled: true }} onChange={() => {}} />,
    );

    expect(settingsButton(screen)).toBeDefined();
    expect(dialog()).toBeNull();
  });

  it('opens a dialog titled Settings', async () => {
    const screen = await render(
      <SettingsDialog settings={{ isAiEnabled: true }} onChange={() => {}} />,
    );

    await openDialog(screen);

    expect(dialog()?.querySelector('h2, [data-slot="dialog-title"]')?.textContent).toBe('Settings');
  });

  it('explains what the AI setting does', async () => {
    const screen = await render(
      <SettingsDialog settings={{ isAiEnabled: true }} onChange={() => {}} />,
    );

    await openDialog(screen);

    expect(dialog()?.textContent).toContain(
      "Uses your browser's built-in AI, only when it is already on your device. Nothing leaves your device.",
    );
  });

  it.each([
    ['on', true],
    ['off', false],
  ])('shows the AI setting %s when it is %s', async (_, isAiEnabled) => {
    const screen = await render(<SettingsDialog settings={{ isAiEnabled }} onChange={() => {}} />);

    await openDialog(screen);

    expect(fieldFor(dialog()!, AI_SWITCH).checked).toBe(isAiEnabled);
  });

  it.each([
    ['off', true, false],
    ['on', false, true],
  ])(
    'asks for the AI setting to be turned %s when its checkbox is clicked',
    async (_, isAiEnabled, isNowEnabled) => {
      const onChange = vi.fn();
      const screen = await render(
        <SettingsDialog settings={{ isAiEnabled }} onChange={onChange} />,
      );
      await openDialog(screen);

      await settle(() => fieldFor(dialog()!, AI_SWITCH).click());

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ isAiEnabled: isNowEnabled });
    },
  );
});
