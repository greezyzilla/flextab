import { beforeEach, describe, expect, it, vi } from "vitest";
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
const pickAction = async (name: string) => { fireEvent.click(await screen.findByRole("button", { name })); };
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
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    await act(async () => { finish(); });
    expect(await screen.findByText(/^Saved to/)).toBeInTheDocument();
    // One main landmark with a level-one heading (TASK-28).
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { level: 1, name: "FlexTab" }));
    expect(screen.getByTitle("Space › Project › Category › Unsorted")).toBeInTheDocument();
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

  it("appends repeated saves into the last group and says when a page is already there", async () => {
    const first = render(<Popup />);
    await screen.findByText(/^Saved to/);
    first.unmount();
    windowTabs([{ id: 2, windowId: 9, index: 0, active: true, title: "Second", url: "https://second.example" }]);
    const second = render(<Popup />);
    await screen.findByText(/^Saved to/);
    expect(storedGroups()).toHaveLength(1);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com", "https://second.example"]);
    second.unmount();
    render(<Popup />);
    expect(await screen.findByText(/^Already in/)).toBeInTheDocument();
    expect(storedGroups()[0].tabs).toHaveLength(2);
  });

  it("undo removes the save; change moves it to another group; Save here brings it back", async () => {
    const view = render(<Popup />);
    await screen.findByText(/^Saved to/);
    expect(screen.getByLabelText("Space › Project › Category › Unsorted")).toBeInTheDocument();
    await pickAction("Move to another group");
    // The picker sits under its row, folded to the current branch; the place
    // box steps aside while picking.
    expect(screen.queryByLabelText("Space › Project › Category › Unsorted")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Category" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Other" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radio", { name: "Inbox" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inbox" }));
    await waitFor(() => expect(screen.getByTitle("Space › Project › Other › Inbox")).toBeInTheDocument());
    expect(storedGroups(0)).toHaveLength(0);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    // Undo ends the journey: the tab is not saved, and saving it is one tap away.
    await screen.findByText("Not saved");
    expect(screen.getByRole("status")).toHaveTextContent("Undone. This tab is not in FlexTab.");
    expect(storedGroups(1)[0].tabs).toEqual([]);
    expect(screen.queryByRole("button", { name: /Move to another group|^Undo$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to another group" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save here" }));
    await screen.findByText(/^Saved to/);
    expect(storedGroups(1)[0].tabs.map(t => t.url)).toEqual(["https://example.com"]);
    view.unmount();
  });

  it("saves the window's other tabs to the page's group in one tap, closes them, and Undo reopens them", async () => {
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
      { id: 3, windowId: 9, index: 2, url: "chrome://settings" },
    ]);
    render(<Popup />);
    await screen.findByText(/^Saved to/);
    const win = screen.getByRole("region", { name: "This window" });
    expect(win).toHaveTextContent("This window · 1 other tab");
    fireEvent.click(within(win).getByRole("button", { name: "Save and close them" }));
    await within(win).findByText(/^Saved 1 tab to/);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com", "https://b.example"]);
    expect(chrome.tabs.remove).toHaveBeenCalledWith([2]);
    expect(win).toHaveTextContent("1 closed");
    fireEvent.click(within(win).getByRole("button", { name: "Undo, reopen 1 tab" }));
    await waitFor(() => expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://example.com"]));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 9, index: 1, url: "https://b.example", active: false });
    expect(win).toHaveTextContent("This window · 1 other tab");
  });

  it("can save the window without closing, then close them from the result", async () => {
    windowTabs([
      { id: 1, windowId: 9, index: 0, active: true, url: "https://example.com", title: "Example" },
      { id: 2, windowId: 9, index: 1, url: "https://b.example", title: "B" },
    ]);
    render(<Popup />);
    await screen.findByText(/^Saved to/);
    const win = screen.getByRole("region", { name: "This window" });
    fireEvent.click(within(win).getByRole("button", { name: "Save them to the same group" }));
    await within(win).findByText(/^Saved 1 tab to/);
    expect(win).not.toHaveTextContent("closed");
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(within(win).getByRole("button", { name: "Undo saving them" })).toBeInTheDocument();
    fireEvent.click(within(win).getByRole("button", { name: "Close them" }));
    await waitFor(() => expect(chrome.tabs.remove).toHaveBeenCalledWith([2]));
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
    expect(within(win).getByRole("button", { name: "Save them to Category" })).toBeInTheDocument();
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
    await screen.findByText(/^Saved to/);
    expect(screen.getByTitle("Space › Project › Kept › Unsorted")).toBeInTheDocument();
  });

  it("handles a tab query failure without writing", async () => {
    vi.mocked(chrome.tabs.query).mockRejectedValue(new Error("tabs unavailable"));
    render(<Popup />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read your tabs");
    expect(storedGroups()).toHaveLength(0);
  });
});

describe("popup access (TASK-3, TASK-7)", () => {
  it("saves on a fresh signed-out install; signing in is not part of saving a page", async () => {
    useAuthStore.setState({ isAuthenticated: false });
    render(<Popup />);
    await screen.findByText(/^Saved to/);
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
    await screen.findByText(/^Saved to/);
    const saved = storedGroups();
    expect(saved.find(g => g.id === "g0")!.tabs.map(t => t.url)).toEqual(["https://old.example"]);
    expect(saved.find(g => g.config?.kind === "unsorted")!.tabs.map(t => t.url)).toEqual(["https://example.com"]);
  });
});


describe("popup update of a saved tab that moved on (TASK-72)", () => {
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

  it("updates the saved tab it was opened from right away, says what changed, and Undo puts it back", async () => {
    await seed()
    on(7, 2)
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_open_links: { "7": link } } as never)
    render(<Popup />)
    expect(await screen.findByText("Updated:")).toBeInTheDocument()
    const status = screen.getByRole("status")
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
    fireEvent.click(screen.getByRole("button", { name: "Save here" }))
    await screen.findByText(/^Saved to/)
    expect(summer().tabs.map(t => t.url)).toEqual([
      "https://anime.test/show/episode/1", "https://anime.test/other/episode/4", "https://anime.test/show/episode/2",
    ])
  })

  it("can keep the saved tab and save the page as a new tab next to it instead", async () => {
    await seed()
    on(7, 2)
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_open_links: { "7": link } } as never)
    render(<Popup />)
    await screen.findByText("Updated:"); await pickAction("Keep Episode 01, save as new")
    await screen.findByText(/^Saved to/)
    expect(summer().tabs.map(t => t.url)).toEqual([
      "https://anime.test/show/episode/1", "https://anime.test/other/episode/4", "https://anime.test/show/episode/2",
    ])
  })

  it("saves as usual when the linked tab is still on the saved page", async () => {
    await seed()
    on(7, 1)
    vi.mocked(chrome.storage.session.get).mockResolvedValue({ flextab_open_links: { "7": link } } as never)
    render(<Popup />)
    expect(await screen.findByText(/^Saved to/)).toBeInTheDocument()
    expect(screen.queryByText("Updated:")).not.toBeInTheDocument()
  })

  it("for a page not opened from FlexTab, updates the one saved tab it clearly continues instead of saving a copy", async () => {
    await seed()
    on(8, 3)
    render(<Popup />)
    expect(await screen.findByText("Updated:")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/Updated to Episode 03.*was Episode 01/)
    expect(storedGroups().find(g => g.config?.kind === "unsorted")).toBeUndefined() // no copy saved
    expect(summer().tabs[0]).toMatchObject({ id: "a", url: "https://anime.test/show/episode/3" })
  })

  it("with equally likely saved episodes, saves, offers the nearest one first and the rest as chips", async () => {
    // Saved episodes of the same show match equally: no single guess.
    await seed([{ ...show(5, "e"), order: 2 }, { ...show(2, "c"), order: 3 }])
    on(8, 3)
    render(<Popup />)
    await screen.findByText(/^Saved to/)
    // The highest one below this page's episode, then the rest in number order;
    // never the other show.
    expect(screen.getByRole("button", { name: "Update Episode 02 instead" })).toBeInTheDocument()
    expect(screen.getByText("Or update another saved episode")).toBeInTheDocument()
    const chips = screen.getByRole("list", { name: "Other saved tabs this page continues" })
    expect(within(chips).getAllByRole("button").map(b => [b.textContent, b.getAttribute("aria-label")])).toEqual([
      ["Ep 01", "Update Episode 01 instead"], ["Ep 05", "Update Episode 05 instead"],
    ])
    fireEvent.click(within(chips).getByRole("button", { name: "Update Episode 01 instead" }))
    expect(await screen.findByText("Updated:")).toBeInTheDocument()
    expect(storedGroups().find(g => g.config?.kind === "unsorted")).toBeUndefined()
    expect(summer().tabs.find(t => t.id === "a")).toMatchObject({ url: "https://anime.test/show/episode/3" })
  })

  it("with two equally likely saved episodes, the first row updates the nearest one", async () => {
    await seed([{ ...show(2, "c"), order: 2 }])
    on(8, 3)
    render(<Popup />)
    await screen.findByText(/^Saved to/)
    expect(screen.queryByRole("list", { name: "Other saved tabs this page continues" })).toBeInTheDocument()
    await pickAction("Update Episode 02 instead")
    expect(await screen.findByText("Updated:")).toBeInTheDocument()
    expect(summer().tabs.find(t => t.id === "c")).toMatchObject({ url: "https://anime.test/show/episode/3" })
  })

  it("a same-site page that continues no saved tab is just saved, with nothing else offered", async () => {
    await seed()
    windowTabs([{ id: 9, windowId: 9, index: 0, active: true, title: "About - AnimeStream", url: "https://anime.test/about" }])
    render(<Popup />)
    await screen.findByText(/^Saved to/)
    expect(screen.queryByRole("button", { name: /^Update .* instead$/ })).not.toBeInTheDocument()
  })
})
