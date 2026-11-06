// Saves a file the app made in memory (comparison PNG, test CSV) to the user's
// device through a temporary download link. Nothing is uploaded anywhere.

/** Starts a download of `blob` named `fileName`. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download asynchronously; release the memory a little later.
  const REVOKE_DELAY_MS = 10_000;
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
