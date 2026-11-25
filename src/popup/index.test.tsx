import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockedAsync } from "~src/test/chromeMocks"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Popup from "./index";
import { useAuthStore } from "~src/store/useAuthStore";
import { useSavedSpacesStore, resetYjsHydration } from "~src/store/useSavedSpacesStore";
import * as yjs from "~src/lib/yjsDoc";
import type { SavedSpace, SavedTab } from "~src/types";

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
// The one quiet alternative, or the group itself to change it.
const pickAction = async (name: string | RegExp) => { fireEvent.click(await screen.findByRole("button", { name })); };
// Opening writes nothing: saving is the "Save to <group>" row.
const saveIt = async () => { await screen.findByText(/^Not saved|^Not in FlexTab|^Save a copy$/); await pickAction(/^Save (a copy )?to /); await screen.findByText(/^Saved to/); };
const windowTabs = (tabs: Partial<chrome.tabs.Tab>[]) => mockedAsync<chrome.tabs.Tab[]>(chrome.tabs.query).mockResolvedValue(tabs as chrome.tabs.Tab[]);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(chrome.storage.session.get).mockResolvedValue({} as never);
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
  // This device last saved in Category (no group yet): most tests start from that suggestion.
  disk["flextab_recent_destinations"] = [{ spaceId: "s", projectId: "p", categoryId: "c" }];
  windowTabs([{ id: 1, windowId: 9, index: 0, active: true, title: "Example", url: "https://example.com" }]);
});

describe("popup widget", () => {
  it("shows recovery instead of saving when workspace storage is corrupt", async () => {
    disk[yjs.PERSIST_KEY] = [255];
    render(<Popup />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your saved workspace");
    expect(screen.getByRole("button", { name: "Reload workspace" })).toBeEnabled();
    expect(disk[yjs.PERSIST_KEY]).toEqual([255]);
  });

  it("opens without writing: names the page and the place it would go, down to the group", async () => {
    const before = structuredClone(disk[yjs.PERSIST_KEY]);
    const view = render(<Popup />);
    expect(await screen.findByText("Not in FlexTab")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Example");
    // Suggested because you saved there before, and it says so.
    expect(status).toHaveTextContent("Last saved in this category");
    // Unsorted doesn't exist yet: it is named, with its row, before the save makes it.
    expect(screen.getByLabelText("Space › Project › Category › Unsorted")).toHaveTextContent("Unsorted");
    expect(screen.getByRole("button", { name: "Save to Unsorted" })).toBeInTheDocument();
    expect(groups()).toHaveLength(0);
    view.unmount();
    // Opened and closed without an action: no tab, group or Unsorted, and no
    // remembered destination (AC #5). (The store's own UI state may persist.)
    expect(disk[yjs.PERSIST_KEY]).toEqual(before);
    expect(disk["flextab_recent_destinations"]).toEqual([{ spaceId: "s", projectId: "p", categoryId: "c" }]);
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  it("saves to the place on screen when asked, acknowledging only once storage resolves", async () => {
    let finish!: () => void;
    writeWorkspace = items => new Promise<void>(resolve => {
      finish = () => { Object.assign(disk, structuredClone(items)); resolve(); };
    });
    const view = render(<Popup />);
    await pickAction("Save to Unsorted");
    await waitFor(() => expect(groups()).toHaveLength(1));
    expect(storedGroups()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Save to Unsorted" })).toBeDisabled();
    await act(async () => { finish(); });
    expect(await screen.findByText(/^Saved to/)).toBeInTheDocument();
    // One main landmark with a level-one heading.
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { level: 1, name: "FlexTab" }));
    expect(screen.getByLabelText("Space › Project › Category › Unsorted")).toBeInTheDocument();
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
    await pickAction("Save to Unsorted");
    await waitFor(() => expect(finish).toBeDefined());
    view.unmount();
    await act(async () => { finish(); });
    expect(storedGroups()).toHaveLength(1);
  });

  it("reports a refused write and retries the same save without duplicates", async () => {
    writeWorkspace = async () => { throw new Error("quota exceeded"); };
    render(<Popup />);
    await pickAction("Save to Unsorted");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this tab");
    expect(screen.getByRole("status")).toHaveTextContent("Your browser refused to store it");
    expect(screen.getByRole("status")).toHaveTextContent("It was going to");
    expect(groups()).toHaveLength(1);
    const groupId = groups()[0].id;
    writeWorkspace = async items => { Object.assign(disk, structuredClone(items)); };
    await pickAction("Try again");
    await screen.findByText(/^Saved to/);
    expect(storedGroups().map(g => g.id)).toEqual([groupId]);
    expect(chrome.tabs.query).toHaveBeenCalledTimes(1);
  });

  it("offers the last group next time, and says when a page is already saved without saving it again", async () => {
    const first = render(<Popup />);
    await saveIt();
    first.unmount();
    windowTabs([{ id: 2, windowId: 9, index: 0, active: true, title: "Second", url: "https://second.example" }]);
    const second = render(<Popup />);
    // The suggestion says where it comes from: your last save.
    await screen.findByText("Last saved to");
    await saveIt();
    expect(storedGroups()).toHaveLength(1);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com", "https://second.example"]);
    second.unmount();
    render(<Popup />);
    expect(await screen.findByText(/^Already in/)).toBeInTheDocument();
    expect(screen.getAllByRole("button").slice(0, 2).map(b => b.textContent)).toEqual(["Open in FlexTab", "Save a copy in another group"]);
    expect(storedGroups()[0].tabs).toHaveLength(2);
  });

  it("a pick only changes the shown place and the Save row; saving is its own click", async () => {
    const view = render(<Popup />);
    await pickAction("Choose another group");
    // The picker sits under its row, folded to the current branch; the place
    // box steps aside while picking.
    expect(screen.queryByLabelText("Space › Project › Category › Unsorted")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Category" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Other" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inbox" }));
    expect(await screen.findByLabelText("Space › Project › Other › Inbox")).toBeInTheDocument();
    expect(screen.getByText("Not in FlexTab")).toBeInTheDocument();
    // Your own pick is no longer a suggestion.
    expect(screen.getByText("Save it to")).toBeInTheDocument();
    expect(screen.queryByText("Last saved in this category")).not.toBeInTheDocument();
    expect(storedGroups(1)[0].tabs).toEqual([]);
    expect(groups(0)).toHaveLength(0);
    await pickAction("Save to Inbox");
    await screen.findByText(/^Saved to/);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
    expect(groups(0)).toHaveLength(0); // never Unsorted, it wasn't shown
    // Undo ends the journey: the tab is not saved, and saving it is one tap away.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("Not saved");
    expect(screen.getByRole("status")).toHaveTextContent("Undone. This tab is not in FlexTab.");
    expect(storedGroups(1)[0].tabs).toEqual([]);
    expect(screen.queryByRole("button", { name: /Move to another group|^Undo$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose another group" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save to Inbox" }));
    await screen.findByText(/^Saved to/);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
    view.unmount();
  });

  it("a saved page moves right away with Move to another group", async () => {
    render(<Popup />);
    await saveIt();
    await pickAction("Move to another group");
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inbox" }));
    await waitFor(() => expect(screen.getByLabelText("Space › Project › Other › Inbox")).toBeInTheDocument());
    expect(storedGroups(0)).toHaveLength(0);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
  });

  it("already saved: Open in FlexTab hands the place to a FlexTab tab and closes the panel", async () => {
    yjs.setSpaces([{ ...tree()[0], projects: [{ ...tree()[0].projects[0], categories: [{ id: "c", name: "Category", order: 0,
      groups: [{ id: "g0", name: "Reading", order: 0, tabs: [{ id: "t0", url: "https://example.com/", title: "Example", favicon: "", order: 0 }] }] }] }] }]);
    await yjs.persistState();
    resetYjsHydration();
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() });
    vi.mocked(chrome.tabs.create).mockResolvedValue({ id: 50 } as never);
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    render(<Popup />);
    await screen.findByText(/^Already in/);
    expect(screen.getByRole("status")).toHaveTextContent("Already in Reading");
    await pickAction("Open in FlexTab");
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://test/newtab.html", active: false });
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ flextab_reveal_request: expect.objectContaining({
      tabId: 50, target: { spaceId: "s", projectId: "p", categoryId: "c", flash: { kind: "tab", id: "t0" } },
    }) });
    expect(chrome.tabs.update).toHaveBeenCalledWith(50, { active: true });
    close.mockRestore();
  });

  it("already saved: a copy goes where picked, after its own Save click", async () => {
    yjs.setSpaces([{ ...tree()[0], projects: [{ ...tree()[0].projects[0], categories: [{ id: "c", name: "Category", order: 0,
      groups: [{ id: "g0", name: "Reading", order: 0, tabs: [{ id: "t0", url: "https://example.com", title: "Example", favicon: "", order: 0 }] }] },
      tree()[0].projects[0].categories[1]] }] }]);
    await yjs.persistState();
    resetYjsHydration();
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() });
    render(<Popup />);
    await pickAction("Save a copy in another group");
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inbox" }));
    expect(await screen.findByText("Save a copy")).toBeInTheDocument();
    expect(storedGroups(1)[0].tabs).toEqual([]);
    await pickAction("Save a copy to Inbox");
    await screen.findByText(/^Saved to/);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
    expect(storedGroups(0)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
  });

  it("with Close after saving from the popup on, saves and closes the window's other tabs (Undo reopens them) and closes this page with the popup", async () => {
    disk["flextab_close_after_popup"] = true;
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
      { id: 3, windowId: 9, index: 2, url: "chrome://settings" },
    ]);
    render(<Popup />);
    await saveIt();
    // This page closes when the popup does: the background is told which tab.
    expect(await screen.findByText("Closes when you close this panel.")).toBeInTheDocument();
    const port = vi.mocked(chrome.runtime.connect).mock.results.at(-1)!.value;
    expect(port.postMessage).toHaveBeenLastCalledWith({ close: 1 });
    const win = screen.getByRole("region", { name: "This window" });
    expect(win).toHaveTextContent("This window · 1 other tab");
    // One way, as the setting says: no "keep open" offer next to it.
    expect(within(win).getAllByRole("button").map(b => b.textContent)).toEqual(["Save and close them", "Choose another group for them"]);
    fireEvent.click(within(win).getByRole("button", { name: "Save and close them" }));
    await within(win).findByText(/^Saved 1 tab to/);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com", "https://b.example"]);
    expect(chrome.tabs.remove).toHaveBeenCalledWith([2]);
    expect(win).toHaveTextContent("1 closed");
    fireEvent.click(within(win).getByRole("button", { name: "Undo, reopen 1 tab" }));
    await waitFor(() => expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com"]));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 9, index: 1, url: "https://b.example", active: false });
    expect(win).toHaveTextContent("This window · 1 other tab");
    // Undoing this page's save keeps it open.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("Not saved");
    expect(port.postMessage).toHaveBeenLastCalledWith({ close: null });
  });

  it("with it off, saves the window's other tabs and leaves them open, with no close offer", async () => {
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
    ]);
    render(<Popup />);
    await saveIt();
    expect(screen.queryByText("Closes when you close this panel.")).not.toBeInTheDocument();
    const win = screen.getByRole("region", { name: "This window" });
    expect(within(win).getAllByRole("button").map(b => b.textContent)).toEqual(["Save them to the same group", "Choose another group for them"]);
    fireEvent.click(within(win).getByRole("button", { name: "Save them to the same group" }));
    await within(win).findByText(/^Saved 1 tab to/);
    expect(win).not.toHaveTextContent("closed");
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(within(win).getAllByRole("button").map(b => b.textContent)).toEqual(["Undo saving them"]);
  });

  it("explains an unsavable page and writes nothing", async () => {
    windowTabs([{ id: 1, active: true, url: "chrome://settings" }]);
    render(<Popup />);
    expect(await screen.findByText("This page can't be saved")).toBeInTheDocument();
    expect(storedGroups()).toHaveLength(0);
  });

  it("on an unsavable page, names where the window's tabs would go", async () => {
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "chrome://settings" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
    ]);
    render(<Popup />);
    await screen.findByText("This page can't be saved");
    const win = screen.getByRole("region", { name: "This window" });
    expect(within(win).getByRole("button", { name: "Save them to Unsorted" })).toBeInTheDocument();
  });

  it("with no place saved to before, names none: picking a group is the first step", async () => {
    delete disk["flextab_recent_destinations"];
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
    ]);
    render(<Popup />);
    await screen.findByText("Not in FlexTab");
    // No guessed place, no list pushed open: just an offer to save, which asks where.
    expect(screen.queryByText(/Save it to|Last saved/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ › /)).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await pickAction("Save to a group");
    expect(screen.getByRole("button", { name: "Save to a group" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument(); // nothing ticked for you
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inbox" }));
    expect(await screen.findByText("Save it to")).toBeInTheDocument();
    expect(groups(0)).toHaveLength(0);
    // The window's tabs can now go to the same named place.
    expect(within(screen.getByRole("region", { name: "This window" })).getByRole("button", { name: "Save them to the same group" })).toBeInTheDocument();
    await pickAction("Save to Inbox");
    await screen.findByText(/^Saved to/);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
  });

  it("the window's tabs get their own picker, in their own section, without moving the page's place", async () => {
    delete disk["flextab_recent_destinations"];
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
    ]);
    render(<Popup />);
    await screen.findByText("Not in FlexTab");
    const win = await screen.findByRole("region", { name: "This window" });
    fireEvent.click(within(win).getByRole("button", { name: "Save them to a group" }));
    // The list sits inside "This window"; the page's own picker stays shut.
    expect(within(win).getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    fireEvent.click(within(win).getByRole("button", { name: "Other" }));
    fireEvent.click(within(win).getByRole("radio", { name: "Inbox" }));
    await within(win).findByRole("button", { name: "Save them to Inbox" });
    // The page still has nothing named.
    expect(screen.getByRole("button", { name: "Save to a group" })).toBeInTheDocument();
    expect(screen.queryByText("Save it to")).not.toBeInTheDocument();
    fireEvent.click(within(win).getByRole("button", { name: "Save them to Inbox" }));
    await waitFor(() => expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://b.example"]));
  });

  it("with no place saved to before, an unsavable page asks for a group before saving the window's tabs", async () => {
    delete disk["flextab_recent_destinations"];
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "chrome://settings" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
    ]);
    render(<Popup />);
    await screen.findByText("This page can't be saved");
    await pickAction("Save them to a group");
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inbox" }));
    fireEvent.click(await within(screen.getByRole("region", { name: "This window" })).findByRole("button", { name: "Save them to Inbox" }));
    await waitFor(() => expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://b.example"]));
  });

  it("opens on a link the right-click menu handed over, instead of the current page", async () => {
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_popup_subject: { url: "https://link.example", title: "A link", at: Date.now() } } as never);
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
    ]);
    render(<Popup />);
    await screen.findByText("Not in FlexTab");
    expect(screen.getByRole("status")).toHaveTextContent("A link");
    expect(chrome.storage.session.remove).toHaveBeenCalledWith("flextab_popup_subject");
    expect(screen.queryByRole("region", { name: "This window" })).not.toBeInTheDocument();
    await pickAction("Save to Unsorted");
    await screen.findByText(/^Saved to/);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://link.example"]);
  });

  it("in an empty workspace, names the new space saving creates (nothing else to pick)", async () => {
    delete disk["flextab_recent_destinations"];
    yjs.setSpaces([]);
    await yjs.persistState();
    resetYjsHydration();
    useSavedSpacesStore.setState({ savedSpaces: [], activeSpaceId: null, activeProjectId: null, activeCategoryId: null });
    render(<Popup />);
    expect(await screen.findByText("Saving creates a new space")).toBeInTheDocument();
    expect(screen.getByLabelText("Personal › General › Uncategorized › Unsorted")).toBeInTheDocument();
    await saveIt();
    expect(yjs.getSpaces()[0].name).toBe("Personal");
  });

  it("handles a tab query failure without writing", async () => {
    vi.mocked(chrome.tabs.query).mockRejectedValue(new Error("tabs unavailable"));
    render(<Popup />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read your tabs");
    expect(storedGroups()).toHaveLength(0);
  });
});

describe("popup access", () => {
  it("saves on a fresh signed-out install; signing in is not part of saving a page", async () => {
    useAuthStore.setState({ isAuthenticated: false });
    render(<Popup />);
    await saveIt();
    expect(storedGroups()).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Sign in/ })).not.toBeInTheDocument();
  });

  it("lets a signed-out device that still holds tabs save", async () => {
    yjs.setSpaces([{ ...tree()[0], projects: [{ ...tree()[0].projects[0], categories: [{ id: "c", name: "Category", order: 0,
      groups: [{ id: "g0", name: "Old", order: 0, tabs: [{ id: "t0", url: "https://old.example", title: "Old", favicon: "", order: 0 }] }] }] }] }]);
    await yjs.persistState();
    resetYjsHydration();
    useAuthStore.setState({ isAuthenticated: false });
    render(<Popup />);
    await saveIt();
    const saved = storedGroups();
    expect(saved.find(g => g.id === "g0")!.tabs.map(t => t.url)).toEqual(["https://old.example"]);
    expect(saved.find(g => g.config?.kind === "unsorted")!.tabs.map(t => t.url)).toEqual(["https://example.com"]);
  });
});


describe("popup update of a saved tab that moved on", () => {
  const show = (n: number, id = `t${n}`) => ({ id, url: `https://anime.test/show/episode/${n}`, title: `Show (Episode 0${n}) - AnimeStream`, favicon: "", order: 0 })
  const seed = async (extra: SavedTab[] = []) => {
    yjs.setSpaces([{ ...tree()[0], projects: [{ ...tree()[0].projects[0], categories: [{ id: "c", name: "Category", order: 0, groups: [
      { id: "g", name: "Summer", order: 0, tabs: [{ ...show(1, "a"), order: 0 }, { ...show(1, "b"), url: "https://anime.test/other/episode/4", title: "Other (Episode 04) - AnimeStream", order: 1 }, ...extra] },
    ] }] }] }])
    await yjs.persistState()
    resetYjsHydration()
    useSavedSpacesStore.setState({ savedSpaces: yjs.getSpaces() })
  }
  const summer = () => storedGroups().find(g => g.id === "g")!
  const link = { spaceId: "s", projectId: "p", categoryId: "c", groupId: "g", tabId: "a" }
  const on = (id: number, n: number) => windowTabs([{ id, windowId: 9, index: 0, active: true, title: `Show (Episode 0${n}) - AnimeStream`, url: `https://anime.test/show/episode/${n}` }])

  it("offers to update the saved tab it was opened from, updates only on click, and Undo puts it back", async () => {
    await seed()
    on(7, 2)
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_open_links: { "7": link } } as never)
    render(<Popup />)
    expect(await screen.findByText(/^Saved as/)).toBeInTheDocument()
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent(/Saved as Episode 01.*This page is Episode 02/)
    expect(screen.getByLabelText("Space › Project › Category › Summer")).toBeInTheDocument()
    expect(summer().tabs[0]).toMatchObject({ id: "a", url: "https://anime.test/show/episode/1" }) // nothing yet
    await pickAction("Update Episode 01 to Episode 02")
    expect(await screen.findByText("Updated:")).toBeInTheDocument()
    expect(status).toHaveTextContent(/Updated to Episode 02.*was Episode 01/)
    // Updated in place: no group to move it to from here.
    expect(screen.getByRole("button", { name: "Keep Episode 01, save as new" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Move to another group" })).not.toBeInTheDocument()
    expect(summer().tabs.map(t => [t.id, t.url, t.title])).toEqual([
      ["a", "https://anime.test/show/episode/2", "Show (Episode 02) - AnimeStream"],
      ["b", "https://anime.test/other/episode/4", "Other (Episode 04) - AnimeStream"],
    ])
    // The dashboard is told which saved tab changed, to outline it.
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ flextab_just_updated: expect.objectContaining({ id: "a" }) })
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    // Undo ends it: the saved tab is back on Episode 01 and this page is not saved.
    await waitFor(() => expect(status).toHaveTextContent("Undone. The saved tab is back on Episode 01."))
    expect(status).toHaveTextContent("Not saved")
    expect(summer().tabs[0]).toMatchObject({ id: "a", url: "https://anime.test/show/episode/1" })
    expect(screen.queryByRole("button", { name: /Update|save as new/ })).not.toBeInTheDocument()
    // Saving it after all puts it next to the saved tab, as a new tab.
    fireEvent.click(screen.getByRole("button", { name: "Save to Summer" }))
    await screen.findByText(/^Saved to/)
    expect(summer().tabs.map(t => t.url)).toEqual([
      "https://anime.test/show/episode/1", "https://anime.test/other/episode/4", "https://anime.test/show/episode/2",
    ])
  })

  it("Save as a new tab leaves the saved tab alone and offers its group, saving on its own click", async () => {
    await seed()
    on(7, 2)
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_open_links: { "7": link } } as never)
    render(<Popup />)
    await pickAction("Save as a new tab")
    expect(await screen.findByText("Not in FlexTab")).toBeInTheDocument()
    expect(summer().tabs).toHaveLength(2)
    await pickAction("Save to Summer")
    await screen.findByText(/^Saved to/)
    expect(summer().tabs.map(t => t.url)).toEqual([
      "https://anime.test/show/episode/1", "https://anime.test/other/episode/4", "https://anime.test/show/episode/2",
    ])
  })

  it("after an update, can keep the saved tab and save the page as a new tab instead", async () => {
    await seed()
    on(7, 2)
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_open_links: { "7": link } } as never)
    render(<Popup />)
    await pickAction("Update Episode 01 to Episode 02")
    await screen.findByText("Updated:"); await pickAction("Keep Episode 01, save as new")
    await screen.findByText(/^Saved to/)
    expect(summer().tabs.map(t => t.url)).toEqual([
      "https://anime.test/show/episode/1", "https://anime.test/other/episode/4", "https://anime.test/show/episode/2",
    ])
  })

  it("says the page is already saved when the linked tab is still on the saved page", async () => {
    await seed()
    on(7, 1)
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_open_links: { "7": link } } as never)
    render(<Popup />)
    await screen.findByText(/^Already in/)
    expect(screen.getByRole("status")).toHaveTextContent("Already in Summer")
    expect(screen.queryByText(/^Saved as/)).not.toBeInTheDocument()
  })

  it("for a page not opened from FlexTab, offers the one saved tab it clearly continues", async () => {
    await seed()
    on(8, 3)
    render(<Popup />)
    await pickAction("Update Episode 01 to Episode 03")
    expect(await screen.findByText("Updated:")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/Updated to Episode 03.*was Episode 01/)
    expect(storedGroups().find(g => g.config?.kind === "unsorted")).toBeUndefined() // no copy saved
    expect(summer().tabs[0]).toMatchObject({ id: "a", url: "https://anime.test/show/episode/3" })
  })

  it("with equally likely saved episodes, selects the nearest; a chip only changes which one Update names", async () => {
    // Saved episodes of the same show match equally: no single guess.
    await seed([{ ...show(5, "e"), order: 2 }, { ...show(2, "c"), order: 3 }])
    on(8, 3)
    render(<Popup />)
    expect(await screen.findByText("Which saved episode?")).toBeInTheDocument()
    // The highest one below this page's episode first, then the rest in number
    // order; never the other show.
    const chips = screen.getByRole("list", { name: "Which saved episode to update" })
    expect(within(chips).getAllByRole("button").map(b => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Ep 02", "true"], ["Ep 01", "false"], ["Ep 05", "false"],
    ])
    expect(screen.getByRole("button", { name: "Update Episode 02 to Episode 03" })).toBeInTheDocument()
    fireEvent.click(within(chips).getByRole("button", { name: "Episode 01" }))
    expect(await screen.findByRole("button", { name: "Update Episode 01 to Episode 03" })).toBeInTheDocument()
    expect(within(chips).getByRole("button", { name: "Episode 01" })).toHaveAttribute("aria-pressed", "true")
    expect(summer().tabs.find(t => t.id === "a")).toMatchObject({ url: "https://anime.test/show/episode/1" }) // nothing yet
    await pickAction("Update Episode 01 to Episode 03")
    expect(await screen.findByText("Updated:")).toBeInTheDocument()
    expect(storedGroups().find(g => g.config?.kind === "unsorted")).toBeUndefined()
    expect(summer().tabs.find(t => t.id === "a")).toMatchObject({ url: "https://anime.test/show/episode/3" })
  })

  it("a same-site page that continues no saved tab is offered a plain save, nothing else", async () => {
    await seed()
    windowTabs([{ id: 9, windowId: 9, index: 0, active: true, title: "About - AnimeStream", url: "https://anime.test/about" }])
    render(<Popup />)
    expect(await screen.findByText("Not in FlexTab")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Update / })).not.toBeInTheDocument()
  })
})
