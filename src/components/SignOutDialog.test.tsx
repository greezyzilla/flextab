import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { TooltipProvider as TestTooltipProvider } from "~src/components/ui/tooltip";
// Settings rows can carry an info tooltip; the app renders them under its root TooltipProvider.
const render = (ui: Parameters<typeof rtlRender>[0], options?: Parameters<typeof rtlRender>[1]) => rtlRender(ui, { wrapper: TestTooltipProvider, ...options });

import userEvent from "@testing-library/user-event";
import { SignOutDialog } from "./SignOutDialog";
import { ProfileTab } from "./settings/AccountTab";
import { ProfilePanel } from "./layout/ProfilePanel";
import { TooltipProvider } from "./ui/tooltip";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSyncStore } from "~src/store/useSyncStore";
import { getSpaces, setSpaces, encodeState } from "~src/lib/yjsDoc";

vi.mock("~src/services/api", async importOriginal => ({
  ...await importOriginal<typeof import("~src/services/api")>(),
  apiGetAuthProviders: vi.fn(async () => []),
  apiListIdentities: vi.fn(async () => ({ identities: [], has_password: true })),
}));

const originalLogout = useAuthStore.getState().logout;
const logout = vi.fn();
const change = vi.fn();
const space = (name: string) => [{ id: "space", name, projects: [], order: 0 }];
let exported: Blob | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  logout.mockResolvedValue(undefined);
  useAuthStore.setState({ isAuthenticated: true, user: { id: "user", name: "Test User", email: "user@example.com", avatar: "", provider: "email", has_password: true }, logout });
  useSyncStore.getState().reset();
  setSpaces(space("Unsynced work"));
  exported = undefined;
  URL.createObjectURL = vi.fn(blob => { exported = blob as Blob; return "blob:backup"; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ logout: originalLogout });
  vi.restoreAllMocks();
});

function open() { render(<SignOutDialog open onOpenChange={change} />); }
const chooseRemove = () => fireEvent.click(screen.getByRole("radio", { name: /Remove tabs from this device/ }));
const confirmButton = () => screen.getByRole("button", { name: "Sign out" });
const unsynced = () => useSyncStore.setState({ dirty: true });

describe("safe sign-out choice", () => {
  it("keeps this device's tabs by default and signs out in one step", async () => {
    open();
    expect(screen.getByRole("radio", { name: /Keep tabs on this device/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(false));
    expect(logout).toHaveBeenCalledExactlyOnceWith({ localData: "keep" });
  });

  it.each(["offline", "error", "syncing", "conflict"])("does not sign out or clear %s work when opened or cancelled", async state => {
    useSyncStore.setState({ dirty: true, conflictPending: state === "conflict", status: state === "conflict" ? "paused" : state as any });
    const before = encodeState();
    open();
    // Keeping is safe: unsynced work stays and syncs after the next sign-in. Removing says what it loses
    // on its own option and asks for consent before the (now destructive) Sign out works.
    expect(screen.getByRole("radio", { name: /Remove tabs from this device/ })).toHaveAccessibleName(/Changes not synced yet are lost too/);
    chooseRemove();
    expect(screen.getByRole("checkbox", { name: "Lose the changes not synced yet" })).not.toBeChecked();
    expect(confirmButton()).toHaveAttribute("data-modal-tone", "destructive");
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(change).toHaveBeenCalledWith(false);
    expect(logout).not.toHaveBeenCalled();
    expect(encodeState()).toEqual(before);
  });

  it("exports current live data without logging out or treating a download request as saved", async () => {
    open();
    chooseRemove();
    setSpaces(space("Edited after dialog opened"));
    fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Check that the JSON file was saved");
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(exported!);
    });
    expect(JSON.parse(content)).toEqual(getSpaces());
    expect(JSON.parse(content)[0].name).toBe("Edited after dialog opened");
  });

  it("keeps the workspace and clears destructive consent after export failure", () => {
    unsynced();
    open();
    chooseRemove();
    fireEvent.click(screen.getByRole("checkbox"));
    vi.mocked(URL.createObjectURL).mockImplementation(() => { throw new Error("download blocked"); });
    fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not download");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(logout).not.toHaveBeenCalled();
    expect(getSpaces()[0].name).toBe("Unsynced work");
  });

  it("removes synced tabs without a consent box: the choice and the red Sign out are the confirmation (TASK-84)", async () => {
    open();
    chooseRemove();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(confirmButton()).toHaveAttribute("data-modal-tone", "destructive");
    fireEvent.click(confirmButton());
    await waitFor(() => expect(change).toHaveBeenCalledWith(false));
    expect(logout).toHaveBeenCalledExactlyOnceWith({ localData: "remove" });
  });

  it("requires explicit consent to remove when changes have not synced", async () => {
    unsynced();
    open();
    chooseRemove();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(change).toHaveBeenCalledWith(false));
    expect(logout).toHaveBeenCalledExactlyOnceWith({ localData: "remove" });
  });

  it("keeps Sign out quiet and Cancel in one place whichever choice is made (TASK-84)", () => {
    open();
    expect(confirmButton()).toHaveAttribute("data-modal-tone", "primary");
    expect(confirmButton()).toHaveClass("min-w-28");
    expect(confirmButton().className).not.toMatch(/accent-fill/);
    chooseRemove();
    expect(confirmButton()).toHaveClass("min-w-28");
  });

  it("goes back to keeping, with fresh consent, when the dialog is reopened", () => {
    unsynced();
    const { rerender } = render(<SignOutDialog open onOpenChange={change} />);
    chooseRemove();
    fireEvent.click(screen.getByRole("checkbox"));
    rerender(<SignOutDialog open={false} onOpenChange={change} />);
    rerender(<SignOutDialog open onOpenChange={change} />);
    expect(screen.getByRole("radio", { name: /Keep tabs on this device/ })).toBeChecked();
    chooseRemove();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();
  });

  it("keeps the dialog open and reports a failed logout", async () => {
    logout.mockRejectedValue(new Error("failed"));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out did not complete");
    expect(change).not.toHaveBeenCalled();
  });

  it("routes the Account › Profile sign-out button through the guard", async () => {
    render(<ProfileTab />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out…" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("routes the profile menu sign-out action through the same guard", async () => {
    render(<TooltipProvider><ProfilePanel /></TooltipProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Test User" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });
});
