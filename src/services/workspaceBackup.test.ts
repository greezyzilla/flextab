import { describe, expect, it } from "vitest";
import { parseWorkspaceBackup } from "./workspaceBackup";
import type { SavedSpace } from "~src/types";

const backup = (): SavedSpace[] => [{
  id: "s", name: "Work", color: "#123456", icon: "briefcase", abbreviation: "WK", order: 1,
  projects: [{
    id: "p", name: "Project", categories: [{
      id: "c", name: "Category", groups: [{
        id: "g", name: "Group", color: "blue", tabs: [{
          id: "t", url: "https://example.com", title: "Example", favicon: "", order: 0,
        }],
      }],
    }],
  }],
}];

describe("parseWorkspaceBackup", () => {
  it("round-trips exported fields without changing the input or retaining references", () => {
    const input = backup();
    const exported = JSON.stringify(input);
    const parsed = parseWorkspaceBackup(JSON.parse(exported));
    expect(parsed).toEqual(input);
    parsed[0].projects[0].categories[0].groups[0].tabs[0].title = "Changed";
    expect(JSON.stringify(input)).toBe(exported);
  });

  it("accepts empty collections and omitted optional presentation fields", () => {
    expect(parseWorkspaceBackup([])).toEqual([]);
    expect(parseWorkspaceBackup([{ id: "s", name: "", projects: [] }])).toEqual([
      { id: "s", name: "", projects: [] },
    ]);
  });

  it("keeps the Unsorted group marker and drops any other group config", () => {
    const input = backup();
    const [group] = input[0].projects[0].categories[0].groups;
    input[0].projects[0].categories[0].groups.push({ ...group, id: "u", name: "Unsorted", tabs: [], config: { kind: "unsorted" } });
    Object.assign(group, { config: { kind: "evil", script: "x" } });
    const parsed = parseWorkspaceBackup(input)[0].projects[0].categories[0].groups;
    expect(parsed.map(g => g.config)).toEqual([undefined, { kind: "unsorted" }]);
    expect("config" in parsed[0]).toBe(false);
  });

  it("drops a group colour outside the palette instead of failing the restore", () => {
    const input = backup();
    const [group] = input[0].projects[0].categories[0].groups;
    input[0].projects[0].categories[0].groups.push(
      { ...group, id: "m", tabs: [], color: "magenta" as never },
      { ...group, id: "n", tabs: [], color: 7 as never },
    );
    const parsed = parseWorkspaceBackup(input)[0].projects[0].categories[0].groups;
    expect(parsed.map(g => g.color)).toEqual(["blue", undefined, undefined]);
    expect("color" in parsed[1] || "color" in parsed[2]).toBe(false);
  });

  it("discards unknown fields rather than importing them into the workspace", () => {
    const input = backup();
    Object.assign(input[0], { unexpected: { privileged: true } });
    expect(parseWorkspaceBackup(input)).toEqual(backup());
  });

  it.each([
    ["root object", {}, "spaces must be an array"],
    ["null space", [null], "spaces[0] must be an object"],
    ["missing projects", [{ id: "s", name: "S" }], "projects must be an array"],
    ["original data-loss payload", [{ id: "broken", name: "Broken", projects: [{ id: "p", name: "P" }] }], "categories must be an array"],
  ])("rejects %s", (_name, input, message) => {
    expect(() => parseWorkspaceBackup(input)).toThrow(message);
  });

  it.each([
    ["space id", (s: any) => { s.id = ""; }, ".id"],
    ["space name", (s: any) => { s.name = null; }, ".name"],
    ["space icon", (s: any) => { s.icon = {}; }, ".icon"],
    ["space color", (s: any) => { s.color = 1; }, ".color"],
    ["space abbreviation", (s: any) => { s.abbreviation = false; }, ".abbreviation"],
    ["space order", (s: any) => { s.order = Infinity; }, ".order"],
    ["project", (s: any) => { s.projects[0] = []; }, ".projects[0]"],
    ["project id", (s: any) => { s.projects[0].id = 42; }, ".id"],
    ["project categories", (s: any) => { s.projects[0].categories = null; }, ".categories"],
    ["category name", (s: any) => { s.projects[0].categories[0].name = {}; }, ".name"],
    ["category groups", (s: any) => { delete s.projects[0].categories[0].groups; }, ".groups"],
    ["group order", (s: any) => { s.projects[0].categories[0].groups[0].order = "0"; }, ".order"],
    ["group tabs", (s: any) => { s.projects[0].categories[0].groups[0].tabs = {}; }, ".tabs"],
    ["null tab", (s: any) => { s.projects[0].categories[0].groups[0].tabs[0] = null; }, ".tabs[0]"],
    ["tab URL", (s: any) => { s.projects[0].categories[0].groups[0].tabs[0].url = {}; }, ".url"],
    ["tab title", (s: any) => { delete s.projects[0].categories[0].groups[0].tabs[0].title; }, ".title"],
    ["tab favicon", (s: any) => { s.projects[0].categories[0].groups[0].tabs[0].favicon = false; }, ".favicon"],
    ["tab order", (s: any) => { s.projects[0].categories[0].groups[0].tabs[0].order = NaN; }, ".order"],
  ])("rejects malformed %s", (_name, corrupt, field) => {
    const input = backup();
    corrupt(input[0]);
    expect(() => parseWorkspaceBackup(input)).toThrow(field);
  });

  it("rejects duplicate IDs across separate branches", () => {
    const input = backup();
    input.push({ id: "other", name: "Other", projects: [{
      id: "other-project", name: "Other", categories: [{
        id: "other-category", name: "Other", groups: [{
          id: "other-group", name: "Other", tabs: [{ id: "t", url: "https://other.com", title: "", favicon: "" }],
        }],
      }],
    }] });
    expect(() => parseWorkspaceBackup(input)).toThrow("unique ID");
  });
});
