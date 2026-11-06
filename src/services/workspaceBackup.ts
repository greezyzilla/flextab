import type { GroupConfig, SavedCategory, SavedGroup, SavedProject, SavedSpace, SavedTab } from "~src/types";

/**
 * Validate the complete exported JSON tree before offering a destructive import.
 * Return fresh, schema-only objects; never carry unknown fields into the live
 * workspace. Empty collections are valid backups.
 */
export function parseWorkspaceBackup(input: unknown): SavedSpace[] {
  const ids = new Set<string>();

  function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid backup: " + path + " must be an object.");
    }
    return value as Record<string, unknown>;
  }

  function text(value: unknown, path: string): string {
    if (typeof value !== "string") {
      throw new Error("Invalid backup: " + path + " must be text.");
    }
    return value;
  }

  function id(value: unknown, path: string): string {
    const result = text(value, path);
    if (!result.trim() || ids.has(result)) {
      throw new Error("Invalid backup: " + path + " must be a non-empty, unique ID.");
    }
    ids.add(result);
    return result;
  }

  function order(value: unknown, path: string): { order?: number } {
    if (value === undefined) return {};
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Invalid backup: " + path + " must be a finite number.");
    }
    return { order: value };
  }

  function optionalText(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : text(value, path);
  }

  function collection<T>(value: unknown, path: string, read: (value: unknown, path: string) => T): T[] {
    if (!Array.isArray(value)) {
      throw new Error("Invalid backup: " + path + " must be an array.");
    }
    return value.map((item, index) => read(item, path + "[" + index + "]"));
  }

  function tab(value: unknown, path: string): SavedTab {
    const node = record(value, path);
    return {
      id: id(node.id, path + ".id"),
      url: text(node.url, path + ".url"),
      title: text(node.title, path + ".title"),
      favicon: text(node.favicon, path + ".favicon"),
      ...order(node.order, path + ".order"),
    };
  }

  function group(value: unknown, path: string): SavedGroup {
    const node = record(value, path);
    return {
      id: id(node.id, path + ".id"),
      name: text(node.name, path + ".name"),
      tabs: collection(node.tabs, path + ".tabs", tab),
      ...order(node.order, path + ".order"),
      ...groupConfig(node.config),
    };
  }

  // Only the known marker survives; anything else in `config` is dropped.
  function groupConfig(value: unknown): { config?: GroupConfig } {
    return value && typeof value === "object" && (value as { kind?: unknown }).kind === "unsorted"
      ? { config: { kind: "unsorted" } }
      : {};
  }

  function category(value: unknown, path: string): SavedCategory {
    const node = record(value, path);
    return {
      id: id(node.id, path + ".id"),
      name: text(node.name, path + ".name"),
      groups: collection(node.groups, path + ".groups", group),
      ...order(node.order, path + ".order"),
    };
  }

  function project(value: unknown, path: string): SavedProject {
    const node = record(value, path);
    return {
      id: id(node.id, path + ".id"),
      name: text(node.name, path + ".name"),
      categories: collection(node.categories, path + ".categories", category),
      ...order(node.order, path + ".order"),
    };
  }

  function space(value: unknown, path: string): SavedSpace {
    const node = record(value, path);
    const icon = optionalText(node.icon, path + ".icon");
    const color = optionalText(node.color, path + ".color");
    const abbreviation = optionalText(node.abbreviation, path + ".abbreviation");
    return {
      id: id(node.id, path + ".id"),
      name: text(node.name, path + ".name"),
      projects: collection(node.projects, path + ".projects", project),
      ...(icon !== undefined ? { icon } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(abbreviation !== undefined ? { abbreviation } : {}),
      ...order(node.order, path + ".order"),
    };
  }

  return collection(input, "spaces", space);
}
