import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { ProfilePanel } from "./layout/ProfilePanel";
import { TabGroup } from "./TabGroup";
import { TooltipProvider } from "./ui/tooltip";
import { useAuthStore } from "~src/store/useAuthStore";
import { setSpaces } from "~src/lib/yjsDoc";
import { syncActiveSelection, useSavedSpacesStore, useActiveGroups } from "~src/store/useSavedSpacesStore";

const { login } = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock("./SignOutDialog", () => ({ SignOutDialog: () => null }));
vi.mock("./ui/sonner", () => ({ showUndoToast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, guestMode: true, loginWithGoogle: login });
  window.history.replaceState(null, "", "#/");
  setSpaces([{ id: "personal", name: "Personal", projects: [{ id: "project", name: "Research", categories: [{ id: "category", name: "General", groups: [{ id: "group", name: "Reading", tabs: [{ id: "tab", title: "Documentation", url: "https://example.com", favicon: "", order: 0 }] }] }] }] }, { id: "work", name: "Work", projects: [] }]);
  syncActiveSelection(true);
});

function GroupHarness() {
  const groups = useActiveGroups();
  return <>{groups.map(group => <TabGroup key={group.id} group={group} location={{ spaceId: "personal", projectId: "project", categoryId: "category" }} />)}</>;
}
function setup(content: React.ReactNode, onDragStart = vi.fn()) {
  render(<TooltipProvider><DndContext onDragStart={onDragStart}>{content}</DndContext></TooltipProvider>);
  return userEvent.setup();
}

async function tabTo(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
  for (let i = 0; i < 15 && document.activeElement !== element; i++) await user.tab();
  expect(element).toHaveFocus();
}

describe("primary keyboard actions", () => {
  it("switches spaces with Space/Enter and exposes the selected space", async () => {
    const user = setup(<ProfilePanel />);
    const personal = screen.getByRole("button", { name: "Switch to Personal" });
    const work = screen.getByRole("button", { name: "Switch to Work" });
    await user.tab();
    expect(personal).toHaveFocus();
    expect(personal).toHaveAttribute("aria-pressed", "true");
    await user.tab();
    expect(work).toHaveFocus();
    await user.keyboard(" ");
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("work");
    expect(work).toHaveAttribute("aria-pressed", "true");
    await user.tab({ shift: true });
    await user.keyboard("{Enter}");
    expect(useSavedSpacesStore.getState().activeSpaceId).toBe("personal");
  });

  it("opens space actions with Shift+F10 and returns focus on Escape", async () => {
    const user = setup(<ProfilePanel />);
    await user.tab();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Move down" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Switch to Personal" })).toHaveFocus();
  });

  it("focuses the space rename input from its menu and restores focus after saving", async () => {
    const user = setup(<ProfilePanel />);
    await user.tab();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await user.keyboard("{Enter}");
    const input = await screen.findByRole("textbox", { name: "Space name" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.clear(input);
    await user.type(input, "Home{Enter}");
    expect(screen.getByRole("button", { name: "Switch to Home" })).toHaveFocus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Space name" })).toHaveFocus());
    await user.keyboard("Discard{Escape}");
    expect(screen.getByRole("button", { name: "Switch to Home" })).toHaveFocus();
  });

  it("adds a space, enters Settings and invokes sign-in without a pointer", async () => {
    const user = setup(<ProfilePanel />);
    await tabTo(user, screen.getByRole("button", { name: "Add space" }));
    await user.keyboard("{Enter}");
    // Name-first: nothing is created until a name is committed.
    expect(useSavedSpacesStore.getState().savedSpaces).toHaveLength(2);
    const nameInput = screen.getByRole("textbox", { name: "New space name" });
    expect(nameInput).toHaveFocus();
    await user.keyboard("Side project{Enter}");
    expect(useSavedSpacesStore.getState().savedSpaces).toHaveLength(3);
    expect(useSavedSpacesStore.getState().savedSpaces.map(s => s.name)).toContain("Side project");
    const settings = screen.getByRole("button", { name: "Settings" });
    await tabTo(user, settings);
    await user.keyboard(" ");
    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
    expect(settings).toHaveAttribute("aria-pressed", "true");
    await tabTo(user, screen.getByRole("button", { name: "Sign in" }));
    await user.keyboard("{Enter}");
    // Opens the full sign-in screen (every provider), not one provider directly.
    await waitFor(() => expect(window.location.hash).toBe("#/signin"));
    expect(login).not.toHaveBeenCalled();
  });

  it("opens a saved tab with Enter without starting a drag", async () => {
    const drag = vi.fn();
    const user = setup(<GroupHarness />, drag);
    const link = screen.getByRole("link", { name: "Open Documentation" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await tabTo(user, link);
    await user.keyboard("{Enter}");
    expect(chrome.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: "https://example.com" });
    expect(drag).not.toHaveBeenCalled();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Reorder Documentation" })).toHaveFocus();
  });

  it("retains keyboard activation of the separate drag handle", async () => {
    const drag = vi.fn();
    const user = setup(<GroupHarness />, drag);
    await tabTo(user, screen.getByRole("button", { name: "Reorder Documentation" }));
    await user.keyboard(" ");
    expect(drag).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
  });

  it("removes a saved tab with a named keyboard action without opening it", async () => {
    const user = setup(<GroupHarness />);
    await tabTo(user, screen.getByRole("button", { name: "Remove Documentation" }));
    await user.keyboard(" ");
    expect(screen.queryByRole("link", { name: "Open Documentation" })).not.toBeInTheDocument();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("opens the group in a new window from its named action", async () => {
    const user = setup(<GroupHarness />);
    await tabTo(user, screen.getByRole("button", { name: "Open all tabs in Reading" }));
    await user.keyboard("{Enter}");
    expect(chrome.windows.create).toHaveBeenCalledExactlyOnceWith({ url: ["https://example.com"] });
  });

  it("saves a rename on Tab without pulling focus back from the next action", async () => {
    const user = setup(<GroupHarness />);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.clear(screen.getByRole("textbox", { name: "Group name" }));
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Queue");
    await user.tab();
    expect(screen.getByRole("button", { name: "Open all tabs in Queue" })).toHaveFocus();
  });

  it("renames a group with the keyboard and restores focus to its trigger", async () => {
    const user = setup(<GroupHarness />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Rename Reading" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const input = screen.getByRole("textbox", { name: "Group name" });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "Research{Enter}");
    expect(screen.getByRole("button", { name: "Rename Research" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Group name" }), "Discard{Escape}");
    expect(screen.getByRole("button", { name: "Rename Research" })).toHaveFocus();
  });
});
