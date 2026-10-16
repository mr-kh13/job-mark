import { settle } from './render';

/** Chooses a file with this content in the file input under `root`, as a user does in the picker. */
export const chooseFile = (root: ParentNode, text: string, name = 'backup.json') =>
  settle(() => {
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([text], name, { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
