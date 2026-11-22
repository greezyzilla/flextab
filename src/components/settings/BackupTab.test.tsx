import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { TooltipProvider as TestTooltipProvider } from "~src/components/ui/tooltip";
// Settings rows can carry an info tooltip; the app renders them under its root TooltipProvider.
const render = (ui: Parameters<typeof rtlRender>[0], options?: Parameters<typeof rtlRender>[1]) => rtlRender(ui, { wrapper: TestTooltipProvider, ...options });

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
  useAuthStore.setState({ isAuthenticated: false, user: null });
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

  it("says which version was kept when a sync conflict was resolved (TASK-67)", async () => {
    vi.mocked(apiListSnapshots).mockResolvedValue([
      { ...snapshot, revision: 44, kind: "" },
      { ...snapshot, revision: 43, kind: "before_resolution" },
      snapshot, // an older server sends no kind
    ]);
    render(<BackupTab />);
    expect(await screen.findByText(/^v44 ·/)).toBeInTheDocument();
    const labels = screen.getAllByText("Before resolving a conflict");
    expect(labels).toHaveLength(1);
    expect(labels[0].closest("[data-slot=settings-list-row]")).toHaveTextContent("v43"); // the badge sits on that version's row
  });

  it("renders populated history and previews the selected version without changing the workspace", async () => {
    const before = yjs.encodeState();
    render(<BackupTab />);
    expect(await screen.findByText(/^v42 ·/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Restore version" }));
    const confirmation = await screen.findByRole("alertdialog", { name: "Restore version v42?" });
    expect(apiRestoreSnapshot).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Restore version" }));
    expect(apiRestoreSnapshot).toHaveBeenCalledExactlyOnceWith(42);
    expect(pullAndOverwrite).not.toHaveBeenCalled();
    expect(screen.getByText("Restoring…")).toBeInTheDocument();
    await act(async () => { finishRestore(43); });
    expect(pullAndOverwrite).toHaveBeenCalledTimes(1);
    expect(apiListSnapshots).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^Restored/)).not.toBeInTheDocument();
    await act(async () => { finishPull(true); });
    // Says what came back (TASK-96).
    expect(await screen.findByText(/^Restored v42\. \d+ tabs? in \d+ spaces?\.$/)).toBeInTheDocument();
    expect(apiListSnapshots).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  async function confirmRestore() {
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    const confirmation = await screen.findByRole("alertdialog");
    await act(async () => { fireEvent.click(within(confirmation).getByRole("button", { name: "Restore version" })); });
  }

  it.each(["false", "rejection"])("reports a failed local pull (%s) and retries only the pull", async (failure) => {
    const before = yjs.encodeState();
    if (failure === "false") vi.mocked(pullAndOverwrite).mockResolvedValueOnce(false);
    else vi.mocked(pullAndOverwrite).mockRejectedValueOnce(new Error("storage failed"));
    render(<BackupTab />);
    await confirmRestore();
    expect(await screen.findByRole("alert")).toHaveTextContent("not fully loaded on this device");
    expect(screen.queryByText("Restored.")).not.toBeInTheDocument();
    expect(yjs.encodeState()).toEqual(before);
    expect(apiListSnapshots).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("button", { name: "Restore version" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry loading workspace" }));
    expect(await screen.findByText("Restored.")).toBeInTheDocument();
    expect(apiRestoreSnapshot).toHaveBeenCalledExactlyOnceWith(42);
    expect(pullAndOverwrite).toHaveBeenCalledTimes(2);
    expect(apiListSnapshots).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
  });

  it("catches a rejected restore without pulling or claiming the server was restored", async () => {
    vi.mocked(apiRestoreSnapshot).mockRejectedValueOnce(new Error("network disconnected"));
    render(<BackupTab />);
    await confirmRestore();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not confirm the restore");
    expect(pullAndOverwrite).not.toHaveBeenCalled();
    expect(screen.queryByText("Restored.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry loading workspace" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
  });

  it("blocks overlapping restore and retry requests while either phase is pending", async () => {
    let finishRestore!: (revision: number) => void;
    let finishPull!: (applied: boolean) => void;
    vi.mocked(apiRestoreSnapshot).mockReturnValueOnce(new Promise(resolve => { finishRestore = resolve; }));
    vi.mocked(pullAndOverwrite).mockResolvedValueOnce(false)
      .mockReturnValueOnce(new Promise(resolve => { finishPull = resolve; }));
    render(<BackupTab />);
    await confirmRestore();
    const restore = screen.getByRole("button", { name: "Restore" });
    expect(restore).toBeDisabled();
    fireEvent.click(restore);
    expect(apiRestoreSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => { finishRestore(43); });
    const retry = await screen.findByRole("button", { name: "Retry loading workspace" });
    fireEvent.click(retry);
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(pullAndOverwrite).toHaveBeenCalledTimes(2);
    await act(async () => { finishPull(false); });
    expect(retry).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("not fully loaded on this device");
    expect(screen.queryByText("Restored.")).not.toBeInTheDocument();
  });

  it("does not start a local overwrite after the backup view is unmounted", async () => {
    let finishRestore!: (revision: number) => void;
    vi.mocked(apiRestoreSnapshot).mockReturnValueOnce(new Promise(resolve => { finishRestore = resolve; }));
    const view = render(<BackupTab />);
    await confirmRestore();
    view.unmount();
    await act(async () => { finishRestore(43); });
    expect(pullAndOverwrite).not.toHaveBeenCalled();
  });

  it("clears the pending recovery action on sign out", async () => {
    vi.mocked(pullAndOverwrite).mockResolvedValueOnce(false);
    render(<BackupTab />);
    await confirmRestore();
    await screen.findByRole("button", { name: "Retry loading workspace" });
    act(() => useAuthStore.setState({ isAuthenticated: false }));
    expect(screen.queryByRole("button", { name: "Retry loading workspace" })).not.toBeInTheDocument();
    act(() => useAuthStore.setState({ isAuthenticated: true }));
    expect(await screen.findByRole("button", { name: "Restore" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not continue an old account's restore after switching accounts", async () => {
    const user = { id: "account-a", email: "a@example.test", name: "A", avatar: "", provider: "email", has_password: true };
    useAuthStore.setState({ user });
    let finishRestore!: (revision: number) => void;
    vi.mocked(apiRestoreSnapshot).mockReturnValueOnce(new Promise(resolve => { finishRestore = resolve; }));
    render(<BackupTab />);
    await confirmRestore();
    await act(async () => { useAuthStore.setState({ user: { ...user, id: "account-b" } }); });
    await act(async () => { finishRestore(43); });
    expect(pullAndOverwrite).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Restored/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
  });

  it("clears an earlier success when the next restore fails", async () => {
    render(<BackupTab />);
    await confirmRestore();
    expect(await screen.findByText(/^Restored/)).toBeInTheDocument();
    vi.mocked(apiRestoreSnapshot).mockRejectedValueOnce(new Error("network disconnected"));
    await confirmRestore();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not confirm the restore");
    expect(screen.queryByText(/^Restored/)).not.toBeInTheDocument();
    expect(pullAndOverwrite).toHaveBeenCalledTimes(1);
  });
});

function upload(contents: string, name = "backup.json") {
  const { container } = render(<BackupTab />);
  const input = container.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File([contents], name)] } });
}

const BACKUP = '[{"id":"new","name":"Imported","projects":[{"id":"p","name":"P","categories":[{"id":"c","name":"C","groups":[{"id":"g","name":"G","tabs":[{"id":"t","url":"https://a.example/","title":"A","favicon":""}]}]}]}]}]';

describe("workspace import (TASK-12)", () => {
  it.each([
    ["malformed JSON", "{ not JSON"],
    ["text with no links", "not JSON"],
    ["the audit data-loss payload", '[{"id":"broken","name":"Broken","projects":[{"id":"p"}]}]'],
    ["missing nested categories", '[{"id":"broken","name":"Broken","projects":[{"id":"p","name":"P"}]}]'],
  ])("rejects %s before any preview and leaves the live document untouched", async (_name, contents) => {
    const before = yjs.encodeState();
    upload(contents);
    await waitFor(() => expect(screen.getByRole("status").textContent).not.toBe(""));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(yjs.encodeState()).toEqual(before);
    expect(yjs.getSpaces()[0].name).toBe("Keep my work");
  });

  it("previews first and changes nothing on Cancel", async () => {
    const before = yjs.encodeState();
    upload(BACKUP);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Import from FlexTab backup");
    expect(dialog).toHaveAccessibleDescription("1 tab in 1 group.");
    // Focus starts on the chosen option, never on the primary (modal standard §8).
    await waitFor(() => expect(within(dialog).getByRole("radio", { name: /Add to my workspace/ })).toHaveFocus());
    expect(yjs.encodeState()).toEqual(before);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(yjs.encodeState()).toEqual(before);
  });

  it("adds a backup beside the workspace by default, with fresh ids", async () => {
    upload(BACKUP);
    expect(await screen.findByRole("radio", { name: /Add to my workspace/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Add 1 tab" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Added 1 tab as a new space “Imported”"));
    const spaces = yjs.getSpaces();
    expect(spaces.map(s => s.name)).toEqual(["Keep my work", "Imported"]);
    expect(spaces[1].id).not.toBe("new");
  });

  it("replaces the workspace only when chosen, as a restore", async () => {
    upload(BACKUP);
    fireEvent.click(await screen.findByRole("radio", { name: /Replace everything/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("This can't be undone.");
    fireEvent.click(screen.getByRole("button", { name: "Replace workspace" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Replaced your workspace with 1 space"));
    expect(yjs.getSpaces().map(s => s.id)).toEqual(["new"]);
  });

  it("allows an explicitly chosen empty restore", async () => {
    upload("[]");
    fireEvent.click(await screen.findByRole("radio", { name: /Replace everything/ }));
    fireEvent.click(screen.getByRole("button", { name: "Replace workspace" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Replaced your workspace with 0 spaces"));
    expect(yjs.getSpaces()).toEqual([]);
  });

  it("adds a bookmarks export as a new space, says what it left out, and never offers replace", async () => {
    upload('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Bar</H3><DL><p><DT><A HREF="https://a.example/">A</A><DT><A HREF="javascript:x">x</A></DL></DL>', "bookmarks.html");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Import from Bookmarks");
    expect(dialog).toHaveTextContent("1 link left out: not a web page");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 tab" }));
    await waitFor(() => expect(yjs.getSpaces().map(s => s.name)).toEqual(["Keep my work", "Bookmarks"]));
  });

  it("warns before an import crosses the plan's sync cap when signed in", async () => {
    const { usePlanStore } = await import("~src/store/usePlanStore");
    useAuthStore.setState({ isAuthenticated: true });
    vi.mocked(apiListSnapshots).mockResolvedValue([]); // the history section loads when signed in
    usePlanStore.setState({ status: { plan: "free", limits: { max_tabs_total: 1, max_tree_bytes: 0, max_snapshots: 0 }, usage: { total_tabs: 0, tree_bytes: 0, snapshots: 0 } } as never, load: async () => {} });
    upload("https://a.example/ | A\nhttps://b.example/ | B", "onetab.txt");
    const warning = await screen.findByText(/This puts you at 2 of 1 tabs/);
    expect(warning.closest("[role=note]")).toHaveTextContent("This puts you at 2 of 1 tabs. Sync pauses until you remove 1.");
    usePlanStore.setState({ status: null });
  });
});
