import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockedAsync } from "~src/test/chromeMocks"
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { ProfilePanel } from "./layout/ProfilePanel";
import { TabGroup } from "./TabGroup";
import { TooltipProvider } from "./ui/tooltip";
import { stubResizeObserver } from "~src/test/stubResizeObserver";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { setSpaces } from "~src/lib/yjsDoc";
import { syncActiveSelection, useSavedSpacesStore, useActiveGroups } from "~src/store/useSavedSpacesStore";

// Tooltips open in these tests; their arrow needs a ResizeObserver.
stubResizeObserver();

const { login } = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock("./SignOutDialog", () => ({ SignOutDialog: () => null }));
vi.mock("./ui/sonner", () => ({ showUndoToast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, isAuthenticated: false, loginWithGoogle: login });
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

  it("keeps the rail for switching only: no space menu on Shift+F10 or right-click", async () => {
    const user = setup(<ProfilePanel />);
    await user.tab();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Switch to Personal" }) });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
    mockedAsync<chrome.tabs.Tab[]>(chrome.tabs.query).mockResolvedValue([]);
    const drag = vi.fn();
    const user = setup(<GroupHarness />, drag);
    const link = screen.getByRole("link", { name: "Open Documentation" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await tabTo(user, link);
    await user.keyboard("{Enter}");
    // Not open anywhere, so it opens in a new tab (an open one would be focused).
    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: "https://example.com" }));
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
    // Remove lives in the tab's "⋯" menu: Enter opens it, arrows pick, Enter runs.
    await tabTo(user, screen.getByRole("button", { name: "Actions for Documentation" }));
    await user.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: "Move to…" });
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(screen.queryByRole("link", { name: "Open Documentation" })).not.toBeInTheDocument());
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("renames a group from its ⋯ menu with focus in the name field", async () => {
    const user = setup(<GroupHarness />);
    await tabTo(user, screen.getByRole("button", { name: "Actions for Reading" }));
    await user.keyboard("{Enter}");
    await screen.findByRole("menuitem", { name: "Rename" });
    await user.keyboard("{Enter}");
    const input = await screen.findByRole("textbox", { name: "Group name" });
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("opens the group in a new window or in this window from its named action", async () => {
    const user = setup(<GroupHarness />);
    await tabTo(user, screen.getByRole("button", { name: "Open all tabs in Reading" }));
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Open in new window" }));
    expect(chrome.windows.create).toHaveBeenCalledExactlyOnceWith({ url: ["https://example.com"] });

    mockedAsync<chrome.windows.Window>(chrome.windows.getCurrent).mockResolvedValue({ id: 7 } as chrome.windows.Window);
    await user.click(screen.getByRole("button", { name: "Open all tabs in Reading" }));
    await user.click(await screen.findByRole("menuitem", { name: "Open in this window" }));
    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://example.com", windowId: 7, active: false }));
  });

  it("opens the group as a browser tab group named like it, and stops asking once declined", async () => {
    const c = chrome as unknown as Record<string, any>;
    let answer = true;
    c.tabs.group = vi.fn(async () => 5);
    c.tabGroups = { update: vi.fn(async () => ({})) };
    c.permissions = { request: vi.fn(async () => answer), remove: vi.fn(async () => true) };
    vi.mocked(chrome.windows.create).mockResolvedValue({ id: 3, tabs: [{ id: 9 }] } as never);
    useSettingsStore.setState({ openAsTabGroups: true });
    try {
      const user = setup(<GroupHarness />);
      const openAll = screen.getByRole("button", { name: "Open all tabs in Reading" });
      await user.click(openAll);
      await user.click(await screen.findByRole("menuitem", { name: "Open in new window" }));
      await waitFor(() => expect(c.tabGroups.update).toHaveBeenCalledWith(5, { title: "Reading", color: "grey" }));
      expect(c.tabs.group).toHaveBeenCalledWith({ tabIds: [9], createProperties: { windowId: 3 } });

      answer = false;
      await user.click(openAll);
      await user.click(await screen.findByRole("menuitem", { name: "Open in new window" }));
      await waitFor(() => expect(useSettingsStore.getState().openAsTabGroups).toBe(false));
      expect(chrome.windows.create).toHaveBeenCalledTimes(2); // declined still opens the tabs
      await user.click(openAll);
      await user.click(await screen.findByRole("menuitem", { name: "Open in new window" }));
      await waitFor(() => expect(chrome.windows.create).toHaveBeenCalledTimes(3));
      expect(c.permissions.request).toHaveBeenCalledTimes(2); // not asked again
    } finally {
      delete c.tabs.group; delete c.tabGroups; delete c.permissions;
      useSettingsStore.setState({ openAsTabGroups: true });
    }
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
