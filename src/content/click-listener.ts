import { classifyButton, findClickable } from './click-classifier';
import { sendMessage } from './send-message';
import type { CapturedJob } from '@/messages/click';

/** What the listener needs from one job site. */
export type SiteAdapter = {
  /**
   * The job panel around a clicked button, or `null` if the button is outside one (a search
   * filter, a card in the results list).
   */
  details(button: Element): Element | null;
  /** Reads the job in that panel. Runs synchronously inside the click handler. */
  extract(details: Element): CapturedJob | null;
};

/**
 * Reports Apply and Save clicks on a job site to the service worker.
 *
 * @param site - Reads the job from the site's markup.
 */
export function listenForClicks(site: SiteAdapter): void {
  // One delegated capture-phase listener survives single-page re-renders and runs before the
  // site's own handlers open a modal or navigate away.
  document.addEventListener(
    'click',
    (event) => {
      // A script on the page can dispatch a click too. Only the user's own clicks count.
      if (!event.isTrusted) return;
      // Cheap label check first: this listener sees every click on the site.
      const button = findClickable(event.target);
      const kind = button && classifyButton(button);
      if (!button || !kind) return;
      const details = site.details(button);
      if (!details) return;
      const job = site.extract(details);
      if (!job) return;

      void sendMessage({ type: 'click', kind, job, clickedAt: new Date().toISOString() });
    },
    true,
  );
}
