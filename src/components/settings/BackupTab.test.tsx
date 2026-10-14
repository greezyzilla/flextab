import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BackupTab } from "./BackupTab";
import * as yjs from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";

vi.mock("~src/services/syncEngine", () => ({ pullAndOverwrite: vi.fn() }));

beforeEach(async () => {
  await yjs.clearState();
  yjs.setSpaces([{ id: "existing", name: "Keep my work", projects: [] }]);
  useAuthStore.setState({ isAuthenticated: false });
});

function upload(contents: string) {
  const { container } = render(<BackupTab />);
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File([contents], "backup.json", { type: "application/json" })] } });
}

describe("workspace import", () => {
  it.each([
    ["malformed JSON", "not JSON"],
    ["the audit data-loss payload", '[{"id":"broken","name":"Broken","projects":[{"id":"p"}]}]'],
    ["missing nested categories", '[{"id":"broken","name":"Broken","projects":[{"id":"p","name":"P"}]}]'],
  ])("rejects %s before confirmation and leaves the live document untouched", async (_name, contents) => {
    const before = yjs.encodeState();
    upload(contents);
    await waitFor(() => expect(screen.getByRole("status").textContent).not.toBe(""));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(yjs.encodeState()).toEqual(before);
    expect(yjs.getSpaces()[0].name).toBe("Keep my work");
  });

  it("keeps the old workspace until confirmation and preserves it on Cancel", async () => {
    const before = yjs.encodeState();
    upload('[{"id":"new","name":"Imported","projects":[]}]');
    await screen.findByRole("alertdialog");
    expect(yjs.encodeState()).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(yjs.encodeState()).toEqual(before);
  });

  it("replaces the workspace after confirming a valid backup", async () => {
    upload('[{"id":"new","name":"Imported","projects":[]}]');
    fireEvent.click(await screen.findByRole("button", { name: "Import & replace" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Imported 1 space"));
    expect(yjs.getSpaces().map(s => s.id)).toEqual(["new"]);
  });

  it("allows an explicitly confirmed empty backup", async () => {
    upload("[]");
    fireEvent.click(await screen.findByRole("button", { name: "Import & replace" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Imported 0 spaces"));
    expect(yjs.getSpaces()).toEqual([]);
  });
});
