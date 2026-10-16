import { afterEach, describe, expect, it } from 'vitest';
import { userClick } from './user-click';

const seen: boolean[] = [];
const recordTrust = (event: Event) => seen.push(event.isTrusted);

afterEach(() => {
  seen.length = 0;
  document.removeEventListener('click', recordTrust, true);
});

describe('userClick', () => {
  it('reaches the page as a trusted click', () => {
    document.addEventListener('click', recordTrust, true);

    userClick(document.body);

    expect(seen).toEqual([true]);
  });

  it('leaves a click that a script dispatches untrusted', () => {
    document.addEventListener('click', recordTrust, true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(seen).toEqual([false]);
  });
});
