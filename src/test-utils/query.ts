/**
 * The control a label points at, for a form rendered under `root` or in a portal.
 *
 * @param root - Where to look for the label.
 * @param label - The label's text.
 * @returns The element the label's `for` points at.
 */
export const fieldFor = <T extends HTMLElement = HTMLInputElement>(
  root: ParentNode,
  label: string,
) => {
  const found = Array.from(root.querySelectorAll('label')).find(
    (candidate) => candidate.textContent === label,
  );
  return document.getElementById(found!.htmlFor) as T;
};

/** The button under `root` with exactly this text. */
export const buttonNamed = (root: ParentNode, name: string) =>
  Array.from(root.querySelectorAll('button')).find((button) => button.textContent.trim() === name)!;
