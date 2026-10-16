import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from './download-file';

const createObjectURL = vi.fn(() => 'blob:abc');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

/** Runs `downloadFile` and returns what the clicked link pointed at. */
const download = (content: string, filename: string, type: string) => {
  const clicked: { download: string; href: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ download: this.download, href: this.href });
  });
  downloadFile(content, filename, type);
  return clicked;
};

describe('downloadFile', () => {
  it('clicks a download link, named as asked, that points at the file', () => {
    const clicked = download('hello', 'backup.json', 'application/json');

    expect(clicked).toEqual([{ download: 'backup.json', href: 'blob:abc' }]);
  });

  it('makes the file from the content and type it was given', async () => {
    download('{"a":1}', 'backup.json', 'application/json');

    const [blob] = createObjectURL.mock.calls[0] as unknown as [Blob];
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"a":1}');
  });

  it('removes its link from the page', () => {
    download('hello', 'backup.json', 'application/json');

    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('releases the file only after ten seconds, so the download can start', () => {
    download('hello', 'backup.json', 'application/json');
    vi.advanceTimersByTime(9_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);

    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:abc');
  });
});
