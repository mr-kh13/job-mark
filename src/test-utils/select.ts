import { settle } from './render';

/** Opens a select the way a pointer does. */
export const openSelect = (trigger: HTMLElement) =>
  settle(() => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    trigger.click();
  });

/** The options of the open select, in order. A closed select can stay mounted, hidden. */
export const selectOptions = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).filter(
    (option) => !option.closest('[hidden]'),
  );

/** Clicks the option of the open select with this text. */
export const pickOption = (text: string) =>
  settle(() =>
    selectOptions()
      .find((option) => option.textContent === text)!
      .click(),
  );
