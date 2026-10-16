const RELEASE_DELAY_MS = 10_000;

/**
 * Saves a file from an extension page with a Blob and a download link.
 *
 * @param content - The file's content.
 * @param filename - The name to save it under.
 * @param type - The file's MIME type.
 */
export function downloadFile(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the file.
  window.setTimeout(() => URL.revokeObjectURL(url), RELEASE_DELAY_MS);
}
