import { describe, expect, it, vi } from 'vitest';
import { formatDate, formatTimeAgo } from './format-date';

describe('formatDate', () => {
  describe('yyyy-MM-dd HH:mm', () => {
    it('formats local time as "2026-10-13 11:57"', () => {
      expect(formatDate(new Date(2026, 9, 13, 11, 57), 'yyyy-MM-dd HH:mm')).toBe(
        '2026-10-13 11:57',
      );
    });

    it('pads single-digit months, days, hours and minutes', () => {
      expect(formatDate(new Date(2026, 0, 5, 3, 4), 'yyyy-MM-dd HH:mm')).toBe('2026-01-05 03:04');
    });

    it('uses the 24-hour clock', () => {
      expect(formatDate(new Date(2026, 9, 13, 23, 0), 'yyyy-MM-dd HH:mm')).toBe('2026-10-13 23:00');
    });
  });

  describe('yyyy-MM-dd', () => {
    it('formats the local date as "2026-10-13", ignoring the time', () => {
      expect(formatDate(new Date(2026, 9, 13, 23, 59), 'yyyy-MM-dd')).toBe('2026-10-13');
    });

    it('pads single-digit months and days', () => {
      expect(formatDate(new Date(2026, 0, 5), 'yyyy-MM-dd')).toBe('2026-01-05');
    });
  });

  it('only accepts the supported formats', () => {
    // Never called: the compiler is the test, so `pnpm typecheck` fails if 'long' is accepted.
    const unsupported = () =>
      // @ts-expect-error 'long' is not one of the supported formats
      formatDate(new Date(), 'long');

    expect(unsupported).toBeTypeOf('function');
  });
});

describe('formatTimeAgo', () => {
  const now = new Date(2026, 9, 13, 15, 0); // 13 Oct 2026, local time

  it.each([
    {
      description: '10 minutes earlier',
      then: new Date(2026, 9, 13, 14, 50),
      expected: '10 minutes ago',
    },
    {
      description: '15 hours earlier',
      then: new Date(2026, 9, 13, 0, 0),
      expected: 'about 15 hours ago',
    },
    { description: '4 days earlier', then: new Date(2026, 9, 9, 9, 0), expected: '4 days ago' },
    { description: '9 months earlier', then: new Date(2026, 0, 3, 9, 0), expected: '9 months ago' },
  ])('says "$expected" for a time $description', ({ then, expected }) => {
    expect(formatTimeAgo(then.toISOString(), now)).toBe(expected);
  });

  it('measures from the current time when no time is given', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    expect(formatTimeAgo(new Date(2026, 9, 13, 12, 0).toISOString())).toBe('about 3 hours ago');

    vi.useRealTimers();
  });
});
