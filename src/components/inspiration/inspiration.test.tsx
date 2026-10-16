import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/store/job';
import { stubLanguageModel } from '@/test-utils/language-model';
import { makeJob } from '@/test-utils/make-job';
import { cleanup, render, settle } from '@/test-utils/render';
import { logger } from '@/utils/logger';
import { forgetRequests } from './generated-line';
import { Inspiration } from './inspiration';
import { chooseMessage } from './messages';

beforeEach(() => {
  localStorage.clear();
  forgetRequests();
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const NOTHING = { applications: 0, thisWeek: 0, bestWeek: 0 };

const AI_NOTE = "Written by your browser's on-device AI. Turn it off in the sheet's Settings.";

const paragraph = (screen: HTMLElement) =>
  screen.querySelector<HTMLElement>('[data-slot="inspiration"]');
const lineOf = (screen: HTMLElement) => paragraph(screen)?.textContent;

const NBSP = String.fromCharCode(0xa0);

const infoButton = (screen: HTMLElement) =>
  screen.querySelector<HTMLButtonElement>('button[aria-label="About this line"]');
const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');

/** True while the page holds the place of the line, a blank line of text hidden from readers. */
const isHolding = (screen: HTMLElement) =>
  paragraph(screen)?.getAttribute('aria-hidden') === 'true' &&
  paragraph(screen)?.textContent === NBSP;

/** Waits, inside act, until the screen shows what the check expects. */
const until = (check: () => void) => settle(() => vi.waitFor(check));

describe('Inspiration', () => {
  it.each([
    ['just after midnight', new Date(2026, 9, 15, 0, 30)],
    ['just before midnight', new Date(2026, 9, 15, 23, 30)],
  ])('shows the message for the local date, %s', async (_, now) => {
    vi.setSystemTime(now);

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    await until(() => expect(lineOf(screen)).toBe(chooseMessage(NOTHING, '2026-10-15')));
  });

  it('chooses the message from how the applications went', async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    const applied = (id: string) =>
      makeJob({ id, status: 'Applied', appliedAt: new Date(2026, 9, 14, 9).toISOString() });

    const screen = await render(
      <Inspiration jobs={[applied('seek:1'), applied('seek:2'), applied('seek:3')]} isAiEnabled />,
    );

    await until(() =>
      expect(lineOf(screen)).toBe('Your best week so far: 3 applications. Well done.'),
    );
  });

  it('puts the message in a paragraph with the class it is given', async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 12));

    const screen = await render(<Inspiration jobs={[]} isAiEnabled className="mt-4" />);
    await until(() => expect(isHolding(screen)).toBe(false));

    expect(paragraph(screen)?.tagName).toBe('P');
    expect(paragraph(screen)?.classList.contains('mt-4')).toBe(true);
    // Balanced lines keep a long line from leaving one word alone on its last row.
    expect(paragraph(screen)?.classList.contains('text-balance')).toBe(true);
  });
});

describe('Inspiration with the on-device model', () => {
  const TODAY = new Date(2026, 9, 15, 12);
  const TOMORROW = new Date(2026, 9, 16, 12);
  const fallbackToday = chooseMessage(NOTHING, '2026-10-15');
  const savedKey = (band: string) => `jobmark:inspiration:${band}`;
  const applied = (id: string) =>
    makeJob({ id, status: 'Applied', appliedAt: new Date(2026, 9, 14, 9).toISOString() });
  const bestWeekJobs = [applied('seek:1'), applied('seek:2'), applied('seek:3')];

  beforeEach(() => {
    vi.setSystemTime(TODAY);
  });

  /** Holds back the model's next answer until the returned function gives it the line. */
  const holdNextLine = (session: ReturnType<typeof stubLanguageModel>['session']) => {
    let writeLine: (line: string) => void = () => {};
    session.prompt.mockReturnValueOnce(new Promise<string>((resolve) => (writeLine = resolve)));
    return (line: string) => settle(() => writeLine(line));
  };

  it('shows nothing while the model writes, then the line it wrote', async () => {
    const { session } = stubLanguageModel();
    const writeLine = holdNextLine(session);

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);
    expect(isHolding(screen)).toBe(true);
    expect(screen.textContent).not.toContain(fallbackToday);

    await writeLine('You are doing well.');

    await until(() => expect(lineOf(screen)).toBe('You are doing well.'));
    expect(isHolding(screen)).toBe(false);
  });

  it('shows a soft pulsing bar while it waits, which fades in only after a short delay', async () => {
    const { session } = stubLanguageModel();
    holdNextLine(session);

    const screen = await render(<Inspiration jobs={[]} isAiEnabled className="mt-4" />);

    const bar = paragraph(screen)?.querySelector('span');
    expect(bar?.className).toMatch(/animate-pulse/);
    expect(paragraph(screen)?.classList.contains('mt-4')).toBe(true);
    expect(paragraph(screen)?.classList.contains('animate-in')).toBe(true);
    expect(paragraph(screen)?.classList.contains('fill-mode-backwards')).toBe(true);
    const delay = Number(paragraph(screen)?.className.match(/delay-(\d+)/)?.[1]);
    expect(delay).toBeGreaterThanOrEqual(300);
  });

  it('shows the fixed line, after the wait, when the model writes an unfit line', async () => {
    const { session } = stubLanguageModel();
    const writeLine = holdNextLine(session);
    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);
    expect(isHolding(screen)).toBe(true);

    await writeLine('You applied 5 times!');

    await until(() => expect(lineOf(screen)).toBe(fallbackToday));
    expect(localStorage.getItem(savedKey('quiet'))).toBeNull();
  });

  it('keeps the line for later visits the same day without asking again', async () => {
    const { api } = stubLanguageModel({ reply: 'You are doing well.' });
    const first = await render(<Inspiration jobs={[]} isAiEnabled />);
    await until(() => expect(lineOf(first)).toBe('You are doing well.'));
    await cleanup();
    forgetRequests(); // The popup is closed and opened again.

    const second = await render(<Inspiration jobs={[]} isAiEnabled />);

    expect(lineOf(second)).toBe('You are doing well.');
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('asks again on the next day, and shows nothing until the new line is written', async () => {
    const { api, session } = stubLanguageModel({ reply: 'You are doing well.' });
    const first = await render(<Inspiration jobs={[]} isAiEnabled />);
    await until(() => expect(lineOf(first)).toBe('You are doing well.'));
    await cleanup();
    vi.setSystemTime(TOMORROW);
    const writeLine = holdNextLine(session);

    const second = await render(<Inspiration jobs={[]} isAiEnabled />);
    expect(isHolding(second)).toBe(true);

    await writeLine('A new day, a fresh start.');

    await until(() => expect(lineOf(second)).toBe('A new day, a fresh start.'));
    expect(api.create).toHaveBeenCalledTimes(2);
  });

  it('keeps a line for each kind of week', async () => {
    const { api, session } = stubLanguageModel({ reply: 'Gentle words for a quiet week.' });
    const quiet = await render(<Inspiration jobs={[]} isAiEnabled />);
    await until(() => expect(lineOf(quiet)).toBe('Gentle words for a quiet week.'));
    await cleanup();
    session.prompt.mockResolvedValue('Brilliant week, well done.');

    const best = await render(<Inspiration jobs={bestWeekJobs} isAiEnabled />);
    await until(() => expect(lineOf(best)).toBe('Brilliant week, well done.'));
    await cleanup();
    forgetRequests(); // The popup is closed and opened again.

    const quietAgain = await render(<Inspiration jobs={[]} isAiEnabled />);

    expect(lineOf(quietAgain)).toBe('Gentle words for a quiet week.');
    expect(api.create).toHaveBeenCalledTimes(2);
  });

  it('shows a line saved earlier today at once, and does not ask the model', async () => {
    localStorage.setItem(
      savedKey('quiet'),
      JSON.stringify({ day: '2026-10-15', text: 'Saved earlier today.' }),
    );
    const { api } = stubLanguageModel();

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    expect(lineOf(screen)).toBe('Saved earlier today.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('does not show a line saved on another day or for another kind of week', async () => {
    localStorage.setItem(
      savedKey('quiet'),
      JSON.stringify({ day: '2026-10-14', text: 'Saved yesterday.' }),
    );
    localStorage.setItem(
      savedKey('best'),
      JSON.stringify({ day: '2026-10-15', text: 'Saved for a best week.' }),
    );
    stubLanguageModel({ availability: 'unavailable' });

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    await until(() => expect(lineOf(screen)).toBe(fallbackToday));
  });

  it('shows the fixed line when the browser has no model', async () => {
    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    await until(() => expect(lineOf(screen)).toBe(fallbackToday));
  });

  it('shows the fixed line when the model is not ready, and starts no download', async () => {
    const { api } = stubLanguageModel({ availability: 'downloadable' });

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    await until(() => expect(lineOf(screen)).toBe(fallbackToday));
    expect(api.create).not.toHaveBeenCalled();
  });

  it('shows the fixed line, and logs a warning, when the model fails', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    stubLanguageModel({ reply: new Error('boom') });

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    await until(() => expect(lineOf(screen)).toBe(fallbackToday));
    expect(warn).toHaveBeenCalled();
  });

  it('does not ask again in the same page after the model failed', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { api } = stubLanguageModel({ reply: 'You are doing well.' });
    api.create.mockRejectedValueOnce(new Error('boom'));
    const first = await render(<Inspiration jobs={[]} isAiEnabled />);
    await until(() => expect(lineOf(first)).toBe(fallbackToday));
    await cleanup();

    const second = await render(<Inspiration jobs={[]} isAiEnabled />);

    expect(lineOf(second)).toBe(fallbackToday);
    expect(api.create).toHaveBeenCalledOnce();
  });

  it.each([
    ['text that is not JSON', '{nope'],
    ['JSON of the wrong shape', '{"day":5}'],
  ])('replaces saved data it cannot read: %s', async (_, saved) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    localStorage.setItem(savedKey('quiet'), saved);
    stubLanguageModel({ reply: 'You are doing well.' });

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    await until(() => expect(lineOf(screen)).toBe('You are doing well.'));
    expect(warn).toHaveBeenCalled();
  });

  it('asks the model once, even when React renders it twice', async () => {
    const { api } = stubLanguageModel({ reply: 'You are doing well.' });

    const screen = await render(
      <StrictMode>
        <Inspiration jobs={[]} isAiEnabled />
      </StrictMode>,
    );
    await until(() => expect(lineOf(screen)).toBe('You are doing well.'));

    expect(api.create).toHaveBeenCalledOnce();
  });

  it.each(['getItem', 'setItem'] as const)(
    'still shows the line the model wrote, and logs a warning, when storage fails to %s',
    async (method) => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error('blocked');
      });
      stubLanguageModel({ reply: 'You are doing well.' });

      const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

      await until(() => expect(lineOf(screen)).toBe('You are doing well.'));
      expect(warn).toHaveBeenCalled();
    },
  );

  it('writes a new line when the week changes while the page is open', async () => {
    const { api, session } = stubLanguageModel({ reply: 'Gentle words for a quiet week.' });
    function Page() {
      const [jobs, setJobs] = useState<Job[]>([]);
      return (
        <>
          <button onClick={() => setJobs(bestWeekJobs)}>Apply</button>
          <Inspiration jobs={jobs} isAiEnabled />
        </>
      );
    }
    const screen = await render(<Page />);
    await until(() => expect(lineOf(screen)).toBe('Gentle words for a quiet week.'));
    session.prompt.mockResolvedValue('Brilliant week, well done.');

    await settle(() => screen.querySelector('button')?.click());

    await until(() => expect(lineOf(screen)).toBe('Brilliant week, well done.'));
    expect(api.create).toHaveBeenCalledTimes(2);
  });

  it('shows a small info button after a line the model wrote, and after the saved copy of it', async () => {
    stubLanguageModel({ reply: 'You are doing well.' });
    const written = await render(<Inspiration jobs={[]} isAiEnabled />);
    await until(() => expect(lineOf(written)).toBe('You are doing well.'));
    expect(infoButton(written)).not.toBeNull();
    expect(paragraph(written)?.hasAttribute('title')).toBe(false);
    await cleanup();
    forgetRequests(); // The popup is closed and opened again.

    const saved = await render(<Inspiration jobs={[]} isAiEnabled />);

    expect(infoButton(saved)).not.toBeNull();
  });

  it('says in a tooltip on the info button that the line is AI-written and where to turn that off', async () => {
    stubLanguageModel({ reply: 'You are doing well.' });
    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);
    await until(() => expect(infoButton(screen)).not.toBeNull());
    expect(tooltip()).toBeNull();

    await settle(() => infoButton(screen)?.focus());

    await until(() => expect(tooltip()?.textContent).toBe(AI_NOTE));
  });

  it('puts no info button after a fixed line', async () => {
    stubLanguageModel({ availability: 'unavailable' });

    const screen = await render(<Inspiration jobs={[]} isAiEnabled />);

    await until(() => expect(lineOf(screen)).toBe(fallbackToday));
    expect(infoButton(screen)).toBeNull();
  });

  it('shows the fixed line at once, and never asks the model, when AI is off', async () => {
    const { api } = stubLanguageModel();

    const screen = await render(<Inspiration jobs={[]} isAiEnabled={false} />);

    expect(lineOf(screen)).toBe(fallbackToday);
    expect(infoButton(screen)).toBeNull();
    expect(api.availability).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('ignores a line saved earlier today when AI is off', async () => {
    localStorage.setItem(
      savedKey('quiet'),
      JSON.stringify({ day: '2026-10-15', text: 'Saved earlier today.' }),
    );

    const screen = await render(<Inspiration jobs={[]} isAiEnabled={false} />);

    expect(lineOf(screen)).toBe(fallbackToday);
  });

  describe('when AI is turned on or off while the page is open', () => {
    function Page({ isInitiallyOn }: { isInitiallyOn: boolean }) {
      const [isAiEnabled, setIsAiEnabled] = useState(isInitiallyOn);
      return (
        <>
          <button onClick={() => setIsAiEnabled(!isAiEnabled)}>Toggle</button>
          <Inspiration jobs={[]} isAiEnabled={isAiEnabled} />
        </>
      );
    }
    const toggle = (screen: HTMLElement) => settle(() => screen.querySelector('button')?.click());

    it('switches to the fixed line, and back to the model line without asking again', async () => {
      const { api } = stubLanguageModel({ reply: 'You are doing well.' });
      const screen = await render(<Page isInitiallyOn />);
      await until(() => expect(lineOf(screen)).toBe('You are doing well.'));

      await toggle(screen);
      expect(lineOf(screen)).toBe(fallbackToday);

      await toggle(screen);
      expect(lineOf(screen)).toBe('You are doing well.');
      expect(api.create).toHaveBeenCalledOnce();
    });

    it('asks the model once it is turned on', async () => {
      const { api } = stubLanguageModel({ reply: 'You are doing well.' });
      const screen = await render(<Page isInitiallyOn={false} />);
      expect(lineOf(screen)).toBe(fallbackToday);
      expect(api.create).not.toHaveBeenCalled();

      await toggle(screen);

      await until(() => expect(lineOf(screen)).toBe('You are doing well.'));
      expect(api.create).toHaveBeenCalledOnce();
    });
  });

  it('asks separately for another kind of week while a request is still under way', async () => {
    const { api, session } = stubLanguageModel();
    const writeQuiet = holdNextLine(session);
    const quiet = await render(<Inspiration jobs={[]} isAiEnabled />);
    const writeBest = holdNextLine(session);
    const best = await render(<Inspiration jobs={bestWeekJobs} isAiEnabled />);

    await writeQuiet('Gentle words for a quiet week.');
    await writeBest('Brilliant week, well done.');

    await until(() => {
      expect(lineOf(quiet)).toBe('Gentle words for a quiet week.');
      expect(lineOf(best)).toBe('Brilliant week, well done.');
    });
    expect(api.create).toHaveBeenCalledTimes(2);
  });
});
