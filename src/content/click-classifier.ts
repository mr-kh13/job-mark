import { normalizeText } from '@/utils/text';
import type { ClickKind } from '@/messages/click';

// Labels match as a whole string, so "Applied", "Saved" and "Easy Apply filter" fall through.
// Sites append the job title: Seek "Apply for <title>", "Save <title>"; LinkedIn "Easy Apply to <title>".
const APPLY = /^(quick apply|easy apply|apply)(\s+(now|(to|for|on)\s.+))?$/i;
const SAVE = /^save(\s+\S.*)?$/i;
const NOT_SAVE_JOB = /^save\s+(search|job alert)s?$/i;
const ENDS_WITH_FILTER = /\bfilters?$/i;
// Button states shown after the action happened; clicking one records nothing.
const DONE_STATE = /^(applied|saved|unsave\w*)$/i;

const CLICKABLE = 'button, a, [role="button"]';

/**
 * Decides whether a button label means Apply or Save.
 *
 * @param label - The label text, from the button's content or its aria-label.
 * @returns The click kind, or `null` for any other label.
 */
export function classifyLabel(label: string): ClickKind | null {
  const text = normalizeText(label);
  if (!text || ENDS_WITH_FILTER.test(text) || NOT_SAVE_JOB.test(text)) return null;
  if (APPLY.test(text)) return 'apply';
  if (SAVE.test(text)) return 'save';
  return null;
}

/**
 * Finds the button, link or `role="button"` element a click landed on.
 *
 * @param target - The click event's target.
 * @returns The clickable element, or `null` if the target is not inside one.
 */
export function findClickable(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(CLICKABLE) : null;
}

/**
 * Classifies a clicked button. Its visible text wins, and the aria-label is the fallback for
 * icon-only buttons. A button showing a finished state ("Applied", "Saved") never matches.
 *
 * @param button - The clicked button.
 * @returns The click kind, or `null` if the button is neither Apply nor Save.
 */
export function classifyButton(button: Element): ClickKind | null {
  const text = normalizeText(button.textContent);
  return (
    classifyLabel(text) ??
    (DONE_STATE.test(text) ? null : classifyLabel(button.getAttribute('aria-label') ?? ''))
  );
}
