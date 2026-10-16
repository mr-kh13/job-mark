import { listenForClicks } from '@/content/click-listener';
import { reportPageJob } from '@/content/page-job';
import { listenForReadRequests } from '@/content/read-job-listener';
import { SEEK_MATCHES, readSeekJob, refFromSeekUrl, seek } from '@/sites/seek';

export default defineContentScript({
  matches: SEEK_MATCHES,
  main: () => {
    listenForClicks(seek);
    reportPageJob(refFromSeekUrl);
    listenForReadRequests(() => readSeekJob(document, location.href));
  },
});
