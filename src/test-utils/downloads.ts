import { vi } from 'vitest';

/** Stands in for the browser's download: records each file's name and content. */
export const captureDownloads = () => {
  const files: { name: string; blob: Blob }[] = [];
  let latest: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    latest = blob;
    return 'blob:download';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    files.push({ name: this.download, blob: latest! });
  });
  return files;
};
