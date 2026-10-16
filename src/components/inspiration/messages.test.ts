import { describe, expect, it } from 'vitest';
import { chooseMessage, weekBand } from './messages';

const NOTHING = { applications: 0, thisWeek: 0, bestWeek: 0 };

describe('weekBand', () => {
  it.each([
    ['no applications at all', 'quiet', NOTHING],
    [
      'no applications this week after earlier ones',
      'quiet',
      { applications: 12, thisWeek: 0, bestWeek: 4 },
    ],
    ['one application', 'active', { applications: 1, thisWeek: 1, bestWeek: 1 }],
    [
      'two applications equal to the best week',
      'active',
      { applications: 2, thisWeek: 2, bestWeek: 2 },
    ],
    [
      'three applications below an earlier best week',
      'active',
      { applications: 20, thisWeek: 3, bestWeek: 5 },
    ],
    [
      'three applications equal to the best week',
      'best',
      { applications: 9, thisWeek: 3, bestWeek: 3 },
    ],
    ['a large best week', 'best', { applications: 30, thisWeek: 8, bestWeek: 8 }],
  ] as const)('puts %s in the "%s" group', (_, band, stats) => {
    expect(weekBand(stats)).toBe(band);
  });
});

/** The days from 2026-10-01 on, as local dates such as "2026-10-01". */
const days = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 10),
  );

/** The message for each of the next 60 days. */
const twoMonthsOfMessages = (stats: Parameters<typeof chooseMessage>[0]) =>
  days(60).map((day) => chooseMessage(stats, day));

describe('chooseMessage', () => {
  it('gives the same message for the same day and numbers', () => {
    const stats = { applications: 12, thisWeek: 4, bestWeek: 9 };

    expect(chooseMessage(stats, '2026-10-15')).toBe(chooseMessage(stats, '2026-10-15'));
  });

  it('gives a different message on each following day', () => {
    const messages = twoMonthsOfMessages(NOTHING);

    messages.slice(1).forEach((message, index) => expect(message).not.toBe(messages[index]));
  });

  it('keeps rotating across a month and a year boundary', () => {
    const stats = { applications: 12, thisWeek: 4, bestWeek: 9 };

    for (const [today, tomorrow] of [
      ['2026-10-31', '2026-11-01'],
      ['2026-12-31', '2027-01-01'],
    ] as const) {
      expect(chooseMessage(stats, tomorrow)).not.toBe(chooseMessage(stats, today));
    }
  });

  it('uses no numbers when nothing was applied for this week', () => {
    const quietWeek = { applications: 12, thisWeek: 0, bestWeek: 4 };

    for (const message of twoMonthsOfMessages(quietWeek)) expect(message).not.toMatch(/\d/);
  });

  it('mentions this week and the total on some days', () => {
    const messages = twoMonthsOfMessages({ applications: 12, thisWeek: 4, bestWeek: 9 });

    expect(messages.some((message) => message.includes('4 applications this week'))).toBe(true);
    expect(messages.some((message) => message.includes('12 applications so far'))).toBe(true);
  });

  it('quotes this week for lines about this week and the total for lines about so far', () => {
    const messages = twoMonthsOfMessages({ applications: 12, thisWeek: 4, bestWeek: 9 });

    for (const message of messages) {
      if (message.includes('this week')) expect(message).toMatch(/^4 applications this week/);
      if (message.includes('so far')) expect(message).toMatch(/^12 applications so far/);
    }
  });

  it('shows only the numbers it was given', () => {
    const messages = twoMonthsOfMessages({ applications: 12, thisWeek: 4, bestWeek: 9 });

    for (const message of messages) {
      for (const number of message.match(/\d+/g) ?? []) expect(['4', '12']).toContain(number);
    }
  });

  it('says "1 application" for a single one', () => {
    const messages = twoMonthsOfMessages({ applications: 1, thisWeek: 1, bestWeek: 1 });

    expect(messages.some((message) => message.includes('1 application '))).toBe(true);
    for (const message of messages) expect(message).not.toContain('1 applications');
  });

  it('celebrates a best week every day once it reaches three applications', () => {
    const messages = twoMonthsOfMessages({ applications: 9, thisWeek: 3, bestWeek: 3 });

    for (const message of messages)
      expect(message).toBe('Your best week so far: 3 applications. Well done.');
  });

  it('does not call a week with fewer than three applications the best', () => {
    const messages = twoMonthsOfMessages({ applications: 2, thisWeek: 2, bestWeek: 2 });

    for (const message of messages) expect(message).not.toMatch(/best week/i);
  });

  it('does not call this week the best when an earlier week was bigger', () => {
    const messages = twoMonthsOfMessages({ applications: 20, thisWeek: 3, bestWeek: 5 });

    for (const message of messages) expect(message).not.toMatch(/best week/i);
  });

  it('keeps every message to one row of the popup', () => {
    const allStats = [
      NOTHING,
      { applications: 1, thisWeek: 1, bestWeek: 1 },
      { applications: 1234, thisWeek: 12, bestWeek: 20 },
      { applications: 1234, thisWeek: 20, bestWeek: 20 },
    ];

    for (const stats of allStats) {
      for (const message of twoMonthsOfMessages(stats))
        expect(message.length).toBeLessThanOrEqual(56);
    }
  });

  it('avoids words that read as pressure', () => {
    const pressure = /\b(only|just|haven't|not yet|behind|should|must|need to|failed|lazy|yet)\b/i;
    const allStats = [NOTHING, { applications: 12, thisWeek: 4, bestWeek: 9 }];

    for (const stats of allStats) {
      for (const message of twoMonthsOfMessages(stats)) expect(message).not.toMatch(pressure);
    }
  });
});
