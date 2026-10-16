import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BackupTab } from "./BackupTab";
import * as yjs from "~src/lib/yjsDoc";
import { useAuthStore } from "~src/store/useAuthStore";
import { apiListSnapshots, apiGetSnapshot, apiRestoreSnapshot, type SnapshotInfo } from "~src/services/snapshots";
import { pullAndOverwrite } from "~src/services/syncEngine";

vi.mock("~src/services/syncEngine", () => ({ pullAndOverwrite: vi.fn() }));
vi.mock("~src/services/snapshots", () => ({
  apiListSnapshots: vi.fn(),
  apiGetSnapshot: vi.fn(),
  apiRestoreSnapshot: vi.fn(),
}));

beforeEach(async () => {
  vi.resetAllMocks();
  await yjs.clearState();
  yjs.setSpaces([{ id: "existing", name: "Keep my work", projects: [] }]);
  useAuthStore.setState({ isAuthenticated: false });
});

describe("version history recovery", () => {
  const snapshot: SnapshotInfo = {
    revision: 42,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    space_count: 1,
    tab_count: 0,
  };

  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
    vi.mocked(apiListSnapshots).mockResolvedValue([snapshot]);
    vi.mocked(apiGetSnapshot).mockResolvedValue([
      { id: "archived", name: "Archived workspace", projects: [] },
    ]);
    vi.mocked(apiRestoreSnapshot).mockResolvedValue(43);
    vi.mocked(pullAndOverwrite).mockResolvedValue(true);
  });

  it("renders populated history and previews the selected version without changing the workspace", async () => {
    const before = yjs.encodeState();
    render(<BackupTab />);
    expect(await screen.findByText("v42")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = await screen.findByRole("dialog", { name: "Version v42" });
    expect(await within(preview).findByText("Archived workspace")).toBeInTheDocument();
    expect(within(preview).getByText(/1 space · 0 tabs/)).toBeInTheDocument();
    expect(apiGetSnapshot).toHaveBeenCalledWith(42);
    expect(apiRestoreSnapshot).not.toHaveBeenCalled();
    expect(pullAndOverwrite).not.toHaveBeenCalled();
    expect(yjs.encodeState()).toEqual(before);
  });

  it("opens a dated restore confirmation from the row and preserves data on Cancel", async () => {
    const before = yjs.encodeState();
    render(<BackupTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "Restore version v42?" });
    expect(confirmation).toHaveTextContent(/snapshot from .+ ago \(1 space · 0 tabs\)/);
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(apiRestoreSnapshot).not.toHaveBeenCalled();
    expect(pullAndOverwrite).not.toHaveBeenCalled();
    expect(yjs.encodeState()).toEqual(before);
  });

  it("restores from preview only after confirmation, pulls after server completion, then reloads history", async () => {
    let finishRestore!: (revision: number) => void;
    let finishPull!: (applied: boolean) => void;
    vi.mocked(apiRestoreSnapshot).mockReturnValue(new Promise(resolve => { finishRestore = resolve; }));
    vi.mocked(pullAndOverwrite).mockReturnValue(new Promise(resolve => { finishPull = resolve; }));
    render(<BackupTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
    await screen.findByText("Archived workspace");
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "Restore version v42?" });
    expect(apiRestoreSnapshot).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Restore" }));
    expect(apiRestoreSnapshot).toHaveBeenCalledExactlyOnceWith(42);
    expect(pullAndOverwrite).not.toHaveBeenCalled();
    expect(screen.getByText("Restoring…")).toBeInTheDocument();
    await act(async () => { finishRestore(43); });
    expect(pullAndOverwrite).toHaveBeenCalledTimes(1);
    expect(apiListSnapshots).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Restored.")).not.toBeInTheDocument();
    await act(async () => { finishPull(true); });
    expect(await screen.findByText("Restored.")).toBeInTheDocument();
    expect(apiListSnapshots).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
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
