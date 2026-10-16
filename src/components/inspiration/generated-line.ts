import { useCallback, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import { generateMessage } from './generate';
import type { WeekBand } from './messages';

const Saved = z.object({ day: z.string(), text: z.string() });

/** One entry per kind of week, so a week that changes kind does not lose the other lines. */
const storageKey = (band: WeekBand) => `jobmark:inspiration:${band}`;

function savedLine(day: string, band: WeekBand): string | undefined {
  try {
    const raw = localStorage.getItem(storageKey(band));
    if (raw === null) return undefined;
    const saved = Saved.parse(JSON.parse(raw));
    return saved.day === day ? saved.text : undefined;
  } catch (error) {
    logger.warn({ err: error }, 'Could not read the saved line');
    return undefined;
  }
}

function saveLine(day: string, band: WeekBand, text: string) {
  try {
    localStorage.setItem(storageKey(band), JSON.stringify({ day, text }));
  } catch (error) {
    logger.warn({ err: error }, 'Could not save the line');
  }
}

/** The requests made since the page opened, kept so each day and kind of week asks only once. */
const requests = new Map<string, Promise<void>>();

/** What each finished request wrote: the line, or `undefined` if the model had none. */
const written = new Map<string, string | undefined>();

const requestId = (day: string, band: WeekBand) => `${day}:${band}`;

function requestLine(day: string, band: WeekBand): Promise<void> {
  const id = requestId(day, band);
  const known = requests.get(id);
  if (known) return known;

  const request = generateMessage(band).then((text) => {
    if (text !== undefined) saveLine(day, band, text);
    written.set(id, text);
  });
  requests.set(id, request);
  return request;
}

const WAITING = Symbol('waiting');
const NO_LINE = Symbol('no line');

/**
 * The line itself, `WAITING` while its request is under way, or `NO_LINE` if it ended with none.
 * A reader with AI turned off never gets a line.
 */
function lineState(
  day: string,
  band: WeekBand,
  isEnabled: boolean,
): string | typeof WAITING | typeof NO_LINE {
  if (!isEnabled) return NO_LINE;
  const saved = savedLine(day, band);
  if (saved !== undefined) return saved;
  const id = requestId(day, band);
  return written.has(id) ? (written.get(id) ?? NO_LINE) : WAITING;
}

/**
 * The line the on-device model writes for a day and kind of week. The first reader of a day and
 * kind of week starts the request, and the line is saved so later visits skip it.
 *
 * @param day - The local date, such as "2026-10-15".
 * @param band - How the week is going.
 * @param isEnabled - Whether the user allows AI lines. When it is off, the model is never asked.
 * @returns Whether the request is still under way, and the line once it has one. There is no line
 * when the model could not write one or AI is off.
 */
export function useWrittenLine(day: string, band: WeekBand, isEnabled: boolean) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (lineState(day, band, isEnabled) === WAITING) void requestLine(day, band).then(onChange);
      return () => {};
    },
    [day, band, isEnabled],
  );
  const state = useSyncExternalStore(subscribe, () => lineState(day, band, isEnabled));
  return { isWaiting: state === WAITING, line: typeof state === 'string' ? state : undefined };
}

/** Forgets the requests made so far, so a test starts clean. */
export function forgetRequests() {
  requests.clear();
  written.clear();
}
