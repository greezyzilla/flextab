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
    categories: [{ id: "c", name: "Category", order: 0, groups: [] }],
  }],
}];
let disk: Record<string, any>;
let writeWorkspace: (items: Record<string, any>) => Promise<void>;
const groups = () => yjs.getSpaces()[0].projects[0].categories[0].groups;
const storedGroups = () => yjs.decodeSpacesFromStorage(disk[yjs.PERSIST_KEY])[0].projects[0].categories[0].groups;

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
  vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1, title: "Example", url: "https://example.com" }] as chrome.tabs.Tab[]);
});

async function openPopup() {
  const view = render(<Popup />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Save Current Tab" })).toBeEnabled());
  return view;
}

describe("popup durable save without a new-tab or sync engine", () => {
  it("does not acknowledge success until storage resolves; reopens from saved bytes", async () => {
    let finish!: () => void;
    writeWorkspace = items => new Promise<void>(resolve => {
      finish = () => { Object.assign(disk, structuredClone(items)); resolve(); };
    });
    const view = await openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Save Current Tab" }));
    await waitFor(() => expect(groups()).toHaveLength(1));
    expect(storedGroups()).toHaveLength(0);
    expect(screen.queryByText("Saved locally!")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Current Tab" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving to this device");
    await act(async () => { finish(); });
    expect(await screen.findByText("Saved locally!")).toBeInTheDocument();
    const savedId = storedGroups()[0].id;
    view.unmount();
    // A reopened popup has a fresh Y.Doc, not the old document with tombstones.
    vi.resetModules();
    const reopened = await import("~src/lib/yjsDoc");
    expect(await reopened.loadPersistedState()).toBe(true);
    const restored = reopened.getSpaces()[0].projects[0].categories[0].groups;
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(savedId);
    expect(restored[0].tabs[0].url).toBe("https://example.com");
    reopened.doc.destroy();
  });

  it("completes an issued storage write even if the popup unmounts before its acknowledgement", async () => {
    let finish!: () => void;
    writeWorkspace = items => new Promise<void>(resolve => {
      finish = () => { Object.assign(disk, structuredClone(items)); resolve(); };
    });
    const view = await openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Save Current Tab" }));
    await waitFor(() => expect(finish).toBeDefined());
    view.unmount();
    await act(async () => { finish(); });
    expect(storedGroups()).toHaveLength(1);
  });

  it("reports storage failure and retries the same group without duplicates", async () => {
    writeWorkspace = async () => { throw new Error("quota exceeded"); };
    await openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Save Current Tab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save to this device");
    expect(screen.queryByText("Saved locally!")).not.toBeInTheDocument();
    expect(storedGroups()).toHaveLength(0);
    expect(groups()).toHaveLength(1);
    const groupId = groups()[0].id;
    writeWorkspace = async items => { Object.assign(disk, structuredClone(items)); };
    fireEvent.click(screen.getByRole("button", { name: "Retry Save" }));
    await screen.findByText("Saved locally!");
    expect(storedGroups()).toHaveLength(1);
    expect(storedGroups()[0].id).toBe(groupId);
    expect(chrome.tabs.query).toHaveBeenCalledTimes(1);
  });

  it("persists all savable tabs in one group", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { url: "https://a.example", title: "A" }, { url: "chrome://newtab", title: "Skip" }, { url: "https://b.example", title: "B" },
    ] as chrome.tabs.Tab[]);
    await openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Save All Tabs" }));
    await screen.findByText("Saved locally!");
    expect(storedGroups()).toHaveLength(1);
    expect(storedGroups()[0].tabs.map(t => t.url)).toEqual(["https://a.example", "https://b.example"]);
  });

  it("coalesces repeated clicks while querying tabs", async () => {
    let answer!: (tabs: chrome.tabs.Tab[]) => void;
    vi.mocked(chrome.tabs.query).mockImplementation(() => new Promise(resolve => { answer = resolve; }) as any);
    await openPopup();
    const button = screen.getByRole("button", { name: "Save Current Tab" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(chrome.tabs.query).toHaveBeenCalledTimes(1);
    await act(async () => { answer([{ url: "https://example.com" }] as chrome.tabs.Tab[]); });
    await screen.findByText("Saved locally!");
    expect(storedGroups()).toHaveLength(1);
  });

  it("handles query failure without mutating the workspace", async () => {
    vi.mocked(chrome.tabs.query).mockRejectedValue(new Error("tabs unavailable"));
    await openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Save Current Tab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read your tabs");
    expect(groups()).toHaveLength(0);
    expect(storedGroups()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Retry Save" })).not.toBeInTheDocument();
  });

  it("does not acknowledge unsavable tabs", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ url: "chrome://settings" }] as chrome.tabs.Tab[]);
    await openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Save Current Tab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No tabs were saved");
    expect(storedGroups()).toHaveLength(0);
    expect(screen.queryByText("Saved locally!")).not.toBeInTheDocument();
  });
});
