import { format, formatDistance } from 'date-fns';

/** The supported date formats, as date-fns patterns. To support another, add it here. */
export type DateFormat =
  /** Local time, such as "2026-10-13 11:57". */
  | 'yyyy-MM-dd HH:mm'
  /** Local date, such as "2026-10-13". */
  | 'yyyy-MM-dd';

/**
 * Formats a date in local time.
 *
 * @param date - The date to format.
 * @param dateFormat - One of the supported formats.
 * @returns The formatted date.
 */
export const formatDate = (date: Date, dateFormat: DateFormat): string => format(date, dateFormat);

/**
 * Says how long before now a time was, such as "10 minutes ago" or "4 days ago".
 *
 * @param iso - ISO time to describe.
 * @param now - The current time.
 * @returns The description.
 */
export const formatTimeAgo = (iso: string, now: Date = new Date()): string =>
  formatDistance(new Date(iso), now, { addSuffix: true });
