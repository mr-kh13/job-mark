import { z } from 'zod';
import { Job } from '@/store/job';

/**
 * Sent by a content script to say which job its tab shows, or `null` when it shows none. Like every
 * message from a content script, it is untrusted input.
 */
export const PageJobMessage = z.object({
  type: z.literal('page-job'),
  id: Job.shape.id.nullable(),
});
export type PageJobMessage = z.infer<typeof PageJobMessage>;
