import { settle } from './render';

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Focuses a text field and types over its value, the way a user does before leaving it. */
export const typeInto = (field: TextField, text: string) =>
  settle(() => {
    field.focus();
    // The prototype's setter skips React's own value tracking, so React sees the change.
    Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });

/** Moves focus out of the field. */
export const leave = (field: TextField) => settle(() => field.blur());

/** Presses a key in the field. */
export const press = (field: TextField, key: string) =>
  settle(() => {
    field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
