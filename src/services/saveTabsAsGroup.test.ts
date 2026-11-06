import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isSavableTabUrl,
  defaultSavedGroupName,
  toSavedTabs,
  saveTabsAsGroup,
} from "./saveTabsAsGroup";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import * as yjs from "~src/lib/yjsDoc";
import type { SavedSpace } from "~src/types";

const { rememberDestination } = vi.hoisted(() => ({ rememberDestination: vi.fn(async () => {}) }));
vi.mock("~src/lib/recentDestinations", () => ({ rememberDestination }));

vi.mock("~src/utils/favicon", () => ({
  faviconToDataUrl: vi.fn(async (u: string) => u || "data:empty"),
}));

const tree = (): SavedSpace[] => [
  {
    id: "s1",
    name: "S",
    order: 0,
    projects: [
      {
        id: "p1",
        name: "P",
        order: 0,
        categories: [
          {
            id: "c1",
            name: "C",
            order: 0,
            groups: [],
          },
        ],
      },
    ],
  },
];

beforeEach(async () => {
  vi.clearAllMocks();
  await yjs.clearState();
  yjs.setSpaces(tree());
  // Force store observer to pick up (observeDeep fires on setSpaces)
  useSavedSpacesStore.setState({
    savedSpaces: yjs.getSpaces(),
    activeSpaceId: "s1",
    activeProjectId: "p1",
    activeCategoryId: "c1",
  });
});

describe("isSavableTabUrl", () => {
  it("rejects chrome:// and empty", () => {
    expect(isSavableTabUrl(undefined)).toBe(false);
    expect(isSavableTabUrl("chrome://extensions")).toBe(false);
    expect(isSavableTabUrl("https://example.com")).toBe(true);
  });
});

describe("defaultSavedGroupName", () => {
  it("includes the prefix", () => {
    expect(defaultSavedGroupName("Window")).toMatch(/^Window /);
  });
});

describe("toSavedTabs", () => {
  it("filters chrome:// and maps favicons", async () => {
    const tabs = await toSavedTabs([
      { url: "chrome://newtab", title: "x" },
      { url: "https://a.com", title: "A", favIconUrl: "fav-a" },
      { url: "https://b.com", title: "B" },
    ]);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toMatchObject({ url: "https://a.com", title: "A", order: 0 });
    expect(tabs[1].order).toBe(1);
  });

  it("passes through already-built SavedTabs", async () => {
    const tabs = await toSavedTabs([
      { id: "t1", url: "https://x.com", title: "X", favicon: "data:x", order: 9 },
    ]);
    expect(tabs).toEqual([
      { id: "t1", url: "https://x.com", title: "X", favicon: "data:x", order: 0 },
    ]);
  });
});

describe("saveTabsAsGroup", () => {
  it("creates one group with tabs embedded (atomic write)", async () => {
    const result = await saveTabsAsGroup({
      target: { spaceId: "s1", projectId: "p1", categoryId: "c1" },
      name: "My Session",
      tabs: [
        { url: "https://a.com", title: "A" },
        { url: "chrome://settings", title: "skip" },
        { url: "https://b.com", title: "B" },
      ],
    });

    expect(result).toEqual({ groupId: expect.any(String), tabCount: 2 });
    const spaces = yjs.getSpaces();
    const groups = spaces[0].projects[0].categories[0].groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("My Session");
    expect(groups[0].tabs.map((t) => t.url).sort()).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
    expect(rememberDestination).toHaveBeenCalledWith({ spaceId: "s1", projectId: "p1", categoryId: "c1" });
  });

  it("returns null when nothing savable or category missing", async () => {
    expect(
      await saveTabsAsGroup({
        target: { spaceId: "s1", projectId: "p1", categoryId: "c1" },
        name: "X",
        tabs: [{ url: "chrome://x" }],
      }),
    ).toBeNull();

    expect(
      await saveTabsAsGroup({
        target: { spaceId: "nope", projectId: "p1", categoryId: "c1" },
        name: "X",
        tabs: [{ url: "https://a.com" }],
      }),
    ).toBeNull();
    expect(rememberDestination).not.toHaveBeenCalled();
  });
});
