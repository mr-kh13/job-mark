import type { WeekBand } from './messages';

type LanguageModelSession = {
  prompt: (input: string) => Promise<string>;
  destroy: () => void;
};

/** The parts of Chrome's built-in Prompt API this file uses. TypeScript does not know it yet. */
type LanguageModelApi = {
  availability: (
    options: unknown,
  ) => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create: (options: unknown) => Promise<LanguageModelSession>;
};

const ENGLISH_TEXT = [{ type: 'text', languages: ['en'] }];

const SYSTEM_PROMPT =
  'You write one short, warm sentence of encouragement for someone looking for a job. ' +
  'Use plain English and at most 8 words. Use no numbers and no quotation marks. ' +
  'Never mention failure, rejection or pressure, and never tell the person to do more. ' +
  'For example: Small steps still count. Or: Keep going, the right role is out there. ' +
  'Write a new line, not one of these.';

const ASK: Record<WeekBand, string> = {
  quiet: 'Write a gentle, general line of encouragement.',
  active: 'They have been applying steadily this week. Write a line that recognises their effort.',
  best: 'This is their best week of applications so far. Write a line that celebrates it.',
};

// One row of the popup holds about 58 characters beside the info icon. The fixed lines stop at 55.
const MAX_LINE_LENGTH = 56;
const SURROUNDING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;
const PRESSURE = /\b(only|just|haven['’]t|not yet|behind|should|must|need to|failed|lazy|yet)\b/i;

/**
 * Checks a line the model wrote. A fit line is one short sentence with no numbers and no word of
 * pressure. Emoji are welcome.
 *
 * @param text - What the model answered.
 * @returns The line, trimmed and without surrounding quotes, or `undefined` if it is unfit.
 */
export function acceptLine(text: string): string | undefined {
  const line = text.trim().replace(SURROUNDING_QUOTES, '').trim();
  const isFit =
    line !== '' && line.length <= MAX_LINE_LENGTH && !/[\r\n\d]/.test(line) && !PRESSURE.test(line);
  return isFit ? line : undefined;
}

/**
 * Asks the browser's on-device model for a warm line. It only uses a model that is ready and never
 * starts a download.
 *
 * The prompt holds the kind of week and nothing else, so no job details reach the model.
 *
 * @param band - How the week is going.
 * @returns The line, or `undefined` if there is no ready model, it fails or its answer is unfit.
 */
export async function generateMessage(band: WeekBand): Promise<string | undefined> {
  const languageModel = (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;
  if (!languageModel) return undefined;

  let session: LanguageModelSession | undefined;
  try {
    const options = { expectedInputs: ENGLISH_TEXT, expectedOutputs: ENGLISH_TEXT };
    if ((await languageModel.availability(options)) !== 'available') return undefined;
    session = await languageModel.create({
      expectedInputs: options.expectedInputs,
      expectedOutputs: options.expectedOutputs,
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
    });
    return acceptLine(await session.prompt(ASK[band]));
  } catch (error) {
    console.warn('Could not write the daily line', error);
    return undefined;
  } finally {
    session?.destroy();
  }
}
