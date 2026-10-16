import { listenForClicks } from '@/content/click-listener';
import { reportPageJob } from '@/content/page-job';
import { listenForReadRequests } from '@/content/read-job-listener';
import { LINKEDIN_MATCHES, linkedin, readLinkedInJob, refFromLinkedInUrl } from '@/sites/linkedin';

export default defineContentScript({
  matches: LINKEDIN_MATCHES,
  main: () => {
    listenForClicks(linkedin);
    reportPageJob(refFromLinkedInUrl);
    listenForReadRequests(() => readLinkedInJob(document, location.href));
  },
});
