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
    // Keeping is safe: unsynced work stays and syncs after the next sign-in.
    expect(screen.getByRole("alertdialog")).toHaveTextContent("stay on this device and sync when you sign in again");
    chooseRemove();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("unsynced changes or an unresolved conflict");
    expect(screen.getByRole("button", { name: "Sign out and remove tabs" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Sign out and remove tabs" })).toBeDisabled();
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

  it("requires explicit consent to remove, even when the sync indicator appears clean", async () => {
    open();
    chooseRemove();
    const button = screen.getByRole("button", { name: "Sign out and remove tabs" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await waitFor(() => expect(change).toHaveBeenCalledWith(false));
    expect(logout).toHaveBeenCalledExactlyOnceWith({ localData: "remove" });
  });

  it("goes back to keeping, with fresh consent, when the dialog is reopened", () => {
    const { rerender } = render(<SignOutDialog open onOpenChange={change} />);
    chooseRemove();
    fireEvent.click(screen.getByRole("checkbox"));
    rerender(<SignOutDialog open={false} onOpenChange={change} />);
    rerender(<SignOutDialog open onOpenChange={change} />);
    expect(screen.getByRole("radio", { name: /Keep tabs on this device/ })).toBeChecked();
    chooseRemove();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Sign out and remove tabs" })).toBeDisabled();
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
