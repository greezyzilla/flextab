import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Popup from "./index";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSavedSpacesStore, resetYjsHydration } from "~src/store/useSavedSpacesStore";
import * as yjs from "~src/lib/yjsDoc";
import type { SavedSpace } from "~src/types";

const tree = (): SavedSpace[] => [{
  id: "s", name: "Space", order: 0,
  projects: [{ id: "p", name: "Project", order: 0,
    categories: [
      { id: "c", name: "Category", order: 0, groups: [] },
      { id: "c2", name: "Other", order: 1, groups: [{ id: "g2", name: "Inbox", order: 0, tabs: [] }] },
    ],
  }],
}];
let disk: Record<string, any>;
let writeWorkspace: (items: Record<string, any>) => Promise<void>;
const groups = (cat = 0) => yjs.getSpaces()[0].projects[0].categories[cat].groups;
const storedGroups = (cat = 0) => yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])[0].projects[0].categories[cat].groups;
const windowTabs = (tabs: Partial<chrome.tabs.Tab>[]) => vi.mocked(chrome.tabs.query).mockResolvedValue(tabs as chrome.tabs.Tab[]);

beforeEach(async () => {
  vi.clearAllMocks();
  disk = {};
  writeWorkspace = async items => { Object.assign(disk, structuredClone(items)); };
  vi.mocked(chrome.storage.local.set).mockImplementation(async (items: any) => {
    if (items[yjs.PERSIST_KEY]) await writeWorkspace(items);
    else Object.assign(disk, structuredClone(items));
  });
  vi.mocked(chrome.storage.local.get).mockImplementation(async (key: any) => ({ [key]: disk[key] }));
  vi.mocked(chrome.storage.local.remove).mockImplementation(async (key: any) => { delete disk[key]; });
  await yjs.clearState();
  yjs.setSpaces(tree());
  await yjs.persistState();
  resetYjsHydration();
  useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c" });
  useAuthStore.setState({ isAuthenticated: true, isLoading: false, initialize: vi.fn(async () => {}) });
  windowTabs([{ id: 1, windowId: 9, index: 0, active: true, title: "Example", url: "https://example.com" }]);
});

describe("popup instant save", () => {
  it("shows recovery instead of saving when workspace storage is corrupt", async () => {
    disk[yjs.PERSIST_KEY] = [255];
    render(<Popup />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your saved workspace");
    expect(screen.getByRole("button", { name: "Reload workspace" })).toBeEnabled();
    expect(disk[yjs.PERSIST_KEY]).toEqual([255]);
  });

  it("saves the current page on open, acknowledging only once storage resolves", async () => {
    let finish!: () => void;
    writeWorkspace = items => new Promise<void>(resolve => {
      finish = () => { Object.assign(disk, structuredClone(items)); resolve(); };
    });
    const view = render(<Popup />);
    await waitFor(() => expect(groups()).toHaveLength(1));
    expect(storedGroups()).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Saving this page");
    await act(async () => { finish(); });
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Space › Project › Category › Unsorted");
    const savedId = storedGroups()[0].id;
    view.unmount();
    // A reopened popup has a fresh Y.Doc, not the old document with tombstones.
    vi.resetModules();
    const reopened = await import("~src/lib/yjsDoc");
    expect(await reopened.loadPersistedState()).toBe(true);
    const restored = reopened.getSpaces()[0].projects[0].categories[0].groups;
    expect(restored.map(g => g.id)).toEqual([savedId]);
    expect(restored[0].tabs[0].url).toBe("https://example.com");
    reopened.doc.destroy();
  });

  it("completes an issued storage write even if the popup closes first", async () => {
    let finish!: () => void;
    writeWorkspace = items => new Promise<void>(resolve => {
      finish = () => { Object.assign(disk, structuredClone(items)); resolve(); };
    });
    const view = render(<Popup />);
    await waitFor(() => expect(finish).toBeDefined());
    view.unmount();
    await act(async () => { finish(); });
    expect(storedGroups()).toHaveLength(1);
  });

  it("reports a refused write and retries the same save without duplicates", async () => {
    writeWorkspace = async () => { throw new Error("quota exceeded"); };
    render(<Popup />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save to this device");
    expect(groups()).toHaveLength(1);
    const groupId = groups()[0].id;
    writeWorkspace = async items => { Object.assign(disk, structuredClone(items)); };
    fireEvent.click(screen.getByRole("button", { name: "Retry Save" }));
    await screen.findByText("✓ Saved");
    expect(storedGroups().map(g => g.id)).toEqual([groupId]);
    expect(chrome.tabs.query).toHaveBeenCalledTimes(1);
  });

  it("appends repeated saves into the last group and says when a page is already there", async () => {
    const first = render(<Popup />);
    await screen.findByText("✓ Saved");
    first.unmount();
    windowTabs([{ id: 2, windowId: 9, index: 0, active: true, title: "Second", url: "https://second.example" }]);
    const second = render(<Popup />);
    await screen.findByText("✓ Saved");
    expect(storedGroups()).toHaveLength(1);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com", "https://second.example"]);
    second.unmount();
    render(<Popup />);
    expect(await screen.findByText("Already saved in")).toBeInTheDocument();
    expect(storedGroups()[0].tabs).toHaveLength(2);
  });

  it("undo removes the save; change moves it to another group", async () => {
    const view = render(<Popup />);
    await screen.findByText("✓ Saved");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inbox" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Other › Inbox"));
    expect(storedGroups(0)).toHaveLength(0);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("Removed from FlexTab.");
    expect(storedGroups(1)[0].tabs).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Save again" }));
    await screen.findByText("✓ Saved");
    view.unmount();
  });

  it("saves the rest of the window, closes them when asked, and undo reopens", async () => {
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
      { id: 3, windowId: 9, index: 2, url: "chrome://settings" },
    ]);
    render(<Popup />);
    await screen.findByText("✓ Saved");
    fireEvent.click(screen.getByRole("switch", { name: "Close tabs after saving" }));
    await waitFor(() => expect(disk.flextab_close_after_save).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Save the other 1 tab in this window" }));
    await screen.findByText(/Saved 1 more, closed 1/);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com", "https://b.example"]);
    expect(chrome.tabs.remove).toHaveBeenCalledWith([2]);
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" })[1]);
    await waitFor(() => expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com"]));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 9, index: 1, url: "https://b.example", active: false });
  });

  it("offers Undo for the last shortcut save", async () => {
    const view = render(<Popup />);
    await screen.findByText("✓ Saved");
    view.unmount();
    // A background capture stored its receipt for the popup.
    const groupId = storedGroups()[0].id;
    const tabId = storedGroups()[0].tabs[0].id;
    disk.flextab_last_capture = {
      target: { spaceId: "s", projectId: "p", categoryId: "c", groupId }, tabIds: [tabId], createdGroup: true,
      duplicates: 0, skipped: 0, closed: [], persisted: true, at: Date.now(),
    };
    windowTabs([{ id: 3, windowId: 9, index: 0, active: true, url: "chrome://newtab" }]);
    render(<Popup />);
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(storedGroups()).toHaveLength(0));
    expect(disk.flextab_last_capture).toBeUndefined();
  });

  it("explains an unsavable page and writes nothing", async () => {
    windowTabs([{ id: 1, active: true, url: "chrome://settings" }]);
    render(<Popup />);
    expect(await screen.findByText("This page can't be saved")).toBeInTheDocument();
    expect(storedGroups()).toHaveLength(0);
  });

  it("falls back to the first category's Unsorted when the remembered one is gone", async () => {
    yjs.setSpaces([{ id: "s", name: "Space", order: 0, projects: [{ id: "p", name: "Project", order: 0, categories: [{
      id: "c", name: "Category", order: 0, groups: [{ id: "g", name: "Old", order: 0, tabs: [{ id: "t", url: "https://old.example", title: "Old", favicon: "", order: 0 }] }],
    }] }] }]);
    await yjs.persistState();
    resetYjsHydration();
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces(), activeSpaceId: "s", activeProjectId: "p", activeCategoryId: "c" });
    yjs.removeCategory("s", "p", "c");
    yjs.addCategory("s", "p", { id: "c9", name: "Kept", order: 0, groups: [{ id: "g9", name: "Old", order: 0, tabs: [{ id: "t", url: "https://old.example", title: "Old", favicon: "", order: 0 }] }] });
    await yjs.persistState();
    // No recent destination and an active category that no longer exists → falls back to the first one.
    render(<Popup />);
    await screen.findByText("✓ Saved");
    expect(screen.getByRole("status")).toHaveTextContent("Project › Kept › Unsorted");
  });

  it("handles a tab query failure without writing", async () => {
    vi.mocked(chrome.tabs.query).mockRejectedValue(new Error("tabs unavailable"));
    render(<Popup />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read your tabs");
    expect(storedGroups()).toHaveLength(0);
  });
});

describe("popup access (TASK-3, TASK-7)", () => {
  it("saves on a fresh signed-out install, with sign-in as an option", async () => {
    useAuthStore.setState({ isAuthenticated: false });
    render(<Popup />);
    await screen.findByText("✓ Saved");
    expect(storedGroups()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Sign in to sync across devices" }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://test/newtab.html#/signin" });
  });

  it("lets a signed-out device that still holds tabs save", async () => {
    yjs.setSpaces([{ ...tree()[0], projects: [{ ...tree()[0].projects[0], categories: [{ id: "c", name: "Category", order: 0,
      groups: [{ id: "g0", name: "Old", order: 0, tabs: [{ id: "t0", url: "https://old.example", title: "Old", favicon: "", order: 0 }] }] }] }] }]);
    await yjs.persistState();
    resetYjsHydration();
    useAuthStore.setState({ isAuthenticated: false });
    render(<Popup />);
    await screen.findByText("✓ Saved");
    const saved = storedGroups();
    expect(saved.find(g => g.id === "g0")!.tabs.map(t => t.url)).toEqual(["https://old.example"]);
    expect(saved.find(g => g.config?.kind === "unsorted")!.tabs.map(t => t.url)).toEqual(["https://example.com"]);
  });
});

