import { vi } from 'vitest';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

type Stub = {
  availability?: Availability;
  /** What the session answers: text, or an error to fail with. */
  reply?: string | Error;
  /** An error for `create` to fail with. */
  createError?: Error;
};

/**
 * Stands in for the browser's `LanguageModel` global. Undo it with `vi.unstubAllGlobals()`.
 *
 * @param stub - How the model behaves; by default it is available and answers with a short line.
 * @returns The mocked API and the session it hands out, so tests can see how they were called.
 */
export function stubLanguageModel(stub: Stub = {}) {
  const reply = stub.reply ?? 'You are doing well.';
  const session = {
    prompt: vi.fn<(input: string) => Promise<string>>(async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    }),
    destroy: vi.fn(),
  };
  const api = {
    availability: vi.fn<(options?: unknown) => Promise<Availability>>(
      async () => stub.availability ?? 'available',
    ),
    create: vi.fn<(options?: unknown) => Promise<typeof session>>(async () => {
      if (stub.createError) throw stub.createError;
      return session;
    }),
  };
  vi.stubGlobal('LanguageModel', api);
  return { api, session };
}
