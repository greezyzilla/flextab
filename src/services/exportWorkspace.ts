import { getSpaces } from "~src/lib/yjsDoc";

/** Export the current live document, including edits not yet mirrored to a store. */
export function exportWorkspace(): void {
  const blob = new Blob([JSON.stringify(getSpaces(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `flextab-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  } finally {
    // Give the browser time to consume the download URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
