import { createRequire } from 'node:module';

// jsdom resets `isTrusted` on every dispatch. The window sees a click before any other listener,
// so it marks the clicks made by `userClick` as trusted.
const { implForWrapper } = createRequire(import.meta.url)('jsdom/lib/generated/idl/utils.js') as {
  implForWrapper: (wrapper: Event) => { isTrusted: boolean };
};

const userClicks = new WeakSet<Event>();

window.addEventListener(
  'click',
  (event) => {
    if (userClicks.has(event)) implForWrapper(event).isTrusted = true;
  },
  true,
);

/**
 * Clicks an element the way a user does: a real click event that the browser marks as trusted.
 * A click made with `dispatchEvent` stays untrusted, as it is in a page script.
 *
 * @param element - The element to click.
 */
export function userClick(element: Element): void {
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  userClicks.add(click);
  element.dispatchEvent(click);
}
