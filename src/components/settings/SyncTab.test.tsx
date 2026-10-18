import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { SyncTab } from "./SyncTab";
import { syncNow } from "~src/services/syncEngine";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { useSyncStore } from "~src/store/useSyncStore";
vi.mock("~src/services/syncEngine", () => ({ syncNow: vi.fn() }));
vi.mock("~src/services/device", () => ({ apiGetDevices: vi.fn(async () => []) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: true });
  useSettingsStore.setState({ autoSync: false });
  useSyncStore.getState().reset();
});

describe("manual sync feedback", () => {
  it("names and describes auto-sync and allows keyboard toggling", async () => {
    const user = userEvent.setup();
    render(<SyncTab />);
    const control = screen.getByRole("switch", { name: "Auto-sync" });
    expect(control).toHaveAccessibleDescription("Keep changes in sync across devices automatically. When off, use “Sync now”.");
    expect(control).not.toBeChecked();
    control.focus();
    await user.keyboard(" ");
    expect(control).toBeChecked();
    expect(useSettingsStore.getState().autoSync).toBe(true);
  });
  it.each([
    [{ status: "ok" }, "success", "Sync completed"],
    [{ status: "offline" }, "error", "Could not reach the server. Your changes are saved locally."],
    [{ status: "conflict" }, "info", "Resolve the sync conflict, then use Sync now again."],
    [{ status: "limit", message: "Size limit reached" }, "error", "Size limit reached"],
    [{ status: "error" }, "error", "Sync did not complete. Your changes are saved locally. Try again."],
  ] as const)("shows the actual %j outcome without enabling auto-sync", async (result, kind, message) => {
    vi.mocked(syncNow).mockResolvedValue(result);
    render(<SyncTab />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(toast[kind]).toHaveBeenCalledWith(message));
    expect(useSettingsStore.getState().autoSync).toBe(false);
    expect(screen.getByRole("button", { name: "Sync now" })).not.toBeDisabled();
    if (result.status !== "ok") expect(toast.success).not.toHaveBeenCalled();
  });
  it("restores the button after an unexpected rejection", async () => {
    vi.mocked(syncNow).mockRejectedValue(new Error("storage unavailable"));
    render(<SyncTab />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Sync now" })).not.toBeDisabled();
  });
});
