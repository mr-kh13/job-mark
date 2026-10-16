import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@/test-utils/render';
import { leave, press, typeInto } from '@/test-utils/text-field';
import { EditableText } from './editable-text';

afterEach(cleanup);

const input = (screen: HTMLElement) => screen.querySelector<HTMLInputElement>('input')!;
const textarea = (screen: HTMLElement) => screen.querySelector<HTMLTextAreaElement>('textarea')!;

describe('EditableText', () => {
  it('shows the stored value, named by its label', async () => {
    const screen = await render(<EditableText value="Acme" label="Company" onCommit={() => {}} />);

    expect(input(screen).value).toBe('Acme');
    expect(input(screen).getAttribute('aria-label')).toBe('Company');
  });

  it('shows what is being typed before it is committed', async () => {
    const onCommit = vi.fn();
    const screen = await render(<EditableText value="Acme" label="Company" onCommit={onCommit} />);

    await typeInto(input(screen), 'Acme Pty');

    expect(input(screen).value).toBe('Acme Pty');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits the typed value when focus leaves', async () => {
    const onCommit = vi.fn();
    const screen = await render(<EditableText value="Acme" label="Company" onCommit={onCommit} />);
    await typeInto(input(screen), 'Globex');

    await leave(input(screen));

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('Globex');
  });

  it('commits when Enter is pressed', async () => {
    const onCommit = vi.fn();
    const screen = await render(<EditableText value="Acme" label="Company" onCommit={onCommit} />);
    await typeInto(input(screen), 'Globex');

    await press(input(screen), 'Enter');

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('Globex');
  });

  it('commits nothing when the value is unchanged', async () => {
    const onCommit = vi.fn();
    const screen = await render(<EditableText value="Acme" label="Company" onCommit={onCommit} />);
    await typeInto(input(screen), 'Acme');

    await leave(input(screen));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits an emptied value', async () => {
    const onCommit = vi.fn();
    const screen = await render(<EditableText value="Acme" label="Company" onCommit={onCommit} />);
    await typeInto(input(screen), '');

    await leave(input(screen));

    expect(onCommit).toHaveBeenCalledExactlyOnceWith('');
  });

  it('shows the stored value again once it has committed', async () => {
    const screen = await render(<EditableText value="Acme" label="Company" onCommit={() => {}} />);
    await typeInto(input(screen), 'Globex');

    await leave(input(screen));

    expect(input(screen).value).toBe('Acme');
  });

  describe('multiline', () => {
    it('shows a text area with the stored value', async () => {
      const screen = await render(
        <EditableText isMultiline value="Line one" label="Notes" onCommit={() => {}} />,
      );

      expect(textarea(screen).value).toBe('Line one');
      expect(screen.querySelector('input')).toBeNull();
    });

    it('commits the typed value when focus leaves', async () => {
      const onCommit = vi.fn();
      const screen = await render(
        <EditableText isMultiline value="" label="Notes" onCommit={onCommit} />,
      );
      await typeInto(textarea(screen), 'First\nSecond');

      await leave(textarea(screen));

      expect(onCommit).toHaveBeenCalledExactlyOnceWith('First\nSecond');
    });

    it('keeps Enter for new lines', async () => {
      const onCommit = vi.fn();
      const screen = await render(
        <EditableText isMultiline value="" label="Notes" onCommit={onCommit} />,
      );
      await typeInto(textarea(screen), 'First');

      await press(textarea(screen), 'Enter');

      expect(onCommit).not.toHaveBeenCalled();
    });
  });
});
