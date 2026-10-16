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

  async function confirmRestore() {
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    const confirmation = await screen.findByRole("alertdialog");
    await act(async () => { fireEvent.click(within(confirmation).getByRole("button", { name: "Restore" })); });
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
    expect(await screen.findByRole("button", { name: "Restore this version" })).toBeDisabled();
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
    expect(screen.queryByText("Restored.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
  });

  it("clears an earlier success when the next restore fails", async () => {
    render(<BackupTab />);
    await confirmRestore();
    expect(await screen.findByText("Restored.")).toBeInTheDocument();
    vi.mocked(apiRestoreSnapshot).mockRejectedValueOnce(new Error("network disconnected"));
    await confirmRestore();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not confirm the restore");
    expect(screen.queryByText("Restored.")).not.toBeInTheDocument();
    expect(pullAndOverwrite).toHaveBeenCalledTimes(1);
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
