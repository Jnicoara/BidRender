/**
 * Hand a file to the browser as a download.
 *
 * The materials list and the accounting export each carry their own copy of
 * these lines; the takeoff export uses this one. Folding the other two in is
 * its own change, not a side effect of adding a third.
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: some browsers start the download after click()
  // returns, and a revoked URL at that moment downloads nothing.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
