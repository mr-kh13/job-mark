// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubLanguageModel } from '@/test-utils/language-model';
import { acceptLine, generateMessage } from './generate';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generateMessage', () => {
  it('returns the line the model writes', async () => {
    stubLanguageModel({ reply: 'Keep going, you are doing well.' });

    expect(await generateMessage('active')).toBe('Keep going, you are doing well.');
  });

  it('returns nothing, without a warning, when the browser has no language model', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await generateMessage('quiet')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'downloadable', 'downloading'] as const)(
    'returns nothing, and starts no download, when the model is %s',
    async (availability) => {
      const { api } = stubLanguageModel({ availability });

      expect(await generateMessage('quiet')).toBeUndefined();
      expect(api.create).not.toHaveBeenCalled();
    },
  );

  it('asks for English in and out, with the same options for the check and the session', async () => {
    const { api } = stubLanguageModel();

    await generateMessage('quiet');

    const english = [{ type: 'text', languages: ['en'] }];
    expect(api.availability).toHaveBeenCalledWith({
      expectedInputs: english,
      expectedOutputs: english,
    });
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedInputs: english, expectedOutputs: english }),
    );
  });

  it('briefs the model to stay warm and brief in the system prompt', async () => {
    const { api } = stubLanguageModel();

    await generateMessage('quiet');

    const [options] = api.create.mock.calls[0] as [
      { initialPrompts: { role: string; content: string }[] },
    ];
    expect(options.initialPrompts).toEqual([
      { role: 'system', content: expect.stringContaining('warm') },
    ]);
    expect(options.initialPrompts[0]?.content).toMatch(/never tell the person to do more/i);
  });

  it('asks for a line of at most 8 words, with examples of that length', async () => {
    const { api } = stubLanguageModel();

    await generateMessage('quiet');

    const [options] = api.create.mock.calls[0] as [{ initialPrompts: { content: string }[] }];
    const prompt = options.initialPrompts[0]?.content ?? '';
    expect(prompt).toMatch(/at most 8 words/i);
    expect(prompt).toMatch(/for example/i);
    expect(prompt).toMatch(/not one of these/i);
  });

  it('does not forbid emoji in the system prompt', async () => {
    const { api } = stubLanguageModel();

    await generateMessage('quiet');

    const [options] = api.create.mock.calls[0] as [{ initialPrompts: { content: string }[] }];
    expect(options.initialPrompts[0]?.content).not.toMatch(/emoji/i);
  });

  it('asks about the week it is given', async () => {
    const asked = async (band: Parameters<typeof generateMessage>[0]) => {
      const { session } = stubLanguageModel();
      await generateMessage(band);
      return session.prompt.mock.calls[0]?.[0];
    };

    expect(await asked('best')).toMatch(/best week/);
    expect(await asked('active')).toMatch(/applying/);
    expect(await asked('active')).not.toMatch(/best week/);
    expect(await asked('quiet')).not.toMatch(/best week|applying/);
  });

  it('sends no numbers and no job details', async () => {
    for (const band of ['quiet', 'active', 'best'] as const) {
      const { session } = stubLanguageModel();

      await generateMessage(band);

      expect(session.prompt.mock.calls[0]?.[0]).not.toMatch(/\d/);
    }
  });

  it('closes the session after it has answered', async () => {
    const { session } = stubLanguageModel();

    await generateMessage('quiet');

    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'the check fails',
      () => stubLanguageModel().api.availability.mockRejectedValue(new Error('boom')),
    ],
    ['the session cannot start', () => stubLanguageModel({ createError: new Error('boom') })],
    ['the session fails', () => stubLanguageModel({ reply: new Error('boom') })],
  ])('returns nothing and logs a warning when %s', async (_, arrange) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    arrange();

    expect(await generateMessage('quiet')).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('closes the session when it fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { session } = stubLanguageModel({ reply: new Error('boom') });

    await generateMessage('quiet');

    expect(session.destroy).toHaveBeenCalledOnce();
  });

  it('returns nothing when the line is not fit to show', async () => {
    stubLanguageModel({ reply: 'You applied 5 times this week!' });

    expect(await generateMessage('active')).toBeUndefined();
  });
});

describe('acceptLine', () => {
  it.each([
    ['a plain sentence', 'Keep going, you are doing well.', 'Keep going, you are doing well.'],
    ['surrounding whitespace', '  Keep going.  \n', 'Keep going.'],
    ['straight quotes around the sentence', '"Keep going."', 'Keep going.'],
    ['curly quotes around the sentence', '“Keep going.”', 'Keep going.'],
    ['spaces inside the quotes', '" Keep going. "', 'Keep going.'],
    ['an apostrophe inside the sentence', "You've got this.", "You've got this."],
    ['exactly 56 characters, the most that fits on one row', 'a'.repeat(56), 'a'.repeat(56)],
    ['an emoji at the end', 'Keep going 🎉', 'Keep going 🎉'],
    ['an emoji in the middle', 'You 💪 are doing well.', 'You 💪 are doing well.'],
  ])('accepts %s', (_, text, expected) => {
    expect(acceptLine(text)).toBe(expected);
  });

  it.each([
    ['nothing', ''],
    ['only whitespace', '   \n '],
    ['only quotes', '""'],
    ['two lines', 'Keep going.\nYou are doing well.'],
    ['a number', 'You applied 5 times!'],
    ['more than 56 characters', 'a'.repeat(57)],
    ['a word of pressure', 'You should apply to more roles.'],
    ['a word of pressure with a curly apostrophe', 'You haven’t applied this week.'],
    ['the word yet', 'Your offer is not here yet.'],
  ])('rejects %s', (_, text) => {
    expect(acceptLine(text)).toBeUndefined();
  });
});
