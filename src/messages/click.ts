import { z } from 'zod';
import { Job, MAX_TEXT_LENGTH } from '@/store/job';

/** Which button was clicked on a job site. */
export const ClickKind = z.enum(['apply', 'save']);
export type ClickKind = z.infer<typeof ClickKind>;

/** What the listener read from the page at click time. `workType` is the site's raw text. */
export const CapturedJob = Job.pick({
  id: true,
  source: true,
  title: true,
  company: true,
  location: true,
  salary: true,
  applyType: true,
  url: true,
}).extend({ workType: z.string().max(MAX_TEXT_LENGTH).optional() });
export type CapturedJob = z.infer<typeof CapturedJob>;

/**
 * Sent by the listener to the service worker, which validates it: a content script runs next to
 * untrusted pages, so its messages are untrusted input.
 */
export const ClickMessage = z.object({
  type: z.literal('click'),
  kind: ClickKind,
  job: CapturedJob,
  clickedAt: z.iso.datetime(),
});
export type ClickMessage = z.infer<typeof ClickMessage>;

/** The service worker's reply to a click message. */
export type ClickResult = {
  outcome: 'saved' | 'upgraded' | 'duplicate';
  job: Job;
};
