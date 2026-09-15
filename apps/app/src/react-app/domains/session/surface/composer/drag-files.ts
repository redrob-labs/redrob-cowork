/**
 * Whether a drag carries files.
 *
 * During `dragover` the browser deliberately withholds the file list — the
 * spec's drag data store is in "protected mode" until drop, so
 * `dataTransfer.files` is EMPTY while the pointer is over the drop target and
 * only fills on the drop event. Gating the drop-zone highlight on
 * `files.length` therefore never lights up, which is why dragging a file onto
 * the composer showed no feedback at all.
 *
 * `types` is readable in protected mode and contains the literal "Files" when
 * the drag holds at least one file, so that is the signal to test.
 */
export function dragEventHasFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;

  const types = dataTransfer.types;
  if (types) {
    // `types` is a DOMStringList in older engines, so read it positionally
    // rather than assuming Array methods exist.
    for (let index = 0; index < types.length; index += 1) {
      if (types[index] === "Files") return true;
    }
  }

  // Drop event (or an engine that omits "Files"): the real list is readable.
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;

  const items = dataTransfer.items;
  if (items) {
    for (let index = 0; index < items.length; index += 1) {
      if (items[index]?.kind === "file") return true;
    }
  }

  return false;
}
