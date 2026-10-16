import { settle } from './render';

/** Opens a menu by pressing its trigger button. */
export const openMenu = (trigger: HTMLElement) =>
  settle(() => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    trigger.click();
  });
