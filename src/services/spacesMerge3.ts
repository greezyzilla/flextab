// Git-style 3-way merge for the spaces tree (base = last-synced snapshot).
//
// Pure + dependency-free. Matches items by stable id at every level
// (space → project → category → group → tab):
//   - changed on one side only        → auto-apply (silent)
//   - same field changed both sides   → conflict (default: keep local)
//   - delete on one side, edit other  → conflict (default: keep the edit)
//   - delete + unchanged other        → respect the delete (drop it)
//   - delete on both                  → gone
//   - add with a new id (incl. same name) → kept (no conflict — different ids)
// `order` is never a conflict — the list is reindexed after merging.
//
// See SYNC_CONFLICT.md for the design + test matrix.

import type { SavedSpace } from "~src/types";

export type ConflictKind = "field" | "delete-edit";

export interface Conflict {
  path: string; // breadcrumb, e.g. "Personal / Work / Docs"
  id: string;
  name: string;
  kind: ConflictKind;
  field?: string; // for "field"
  base?: unknown;
  server?: unknown;
  local?: unknown;
  deletedOn?: "server" | "local"; // for "delete-edit"
}

export interface Merge3Result {
  merged: SavedSpace[];
  conflicts: Conflict[];
}

// deep-equal ignoring `order` (reorders aren't content changes / conflicts)
function stripOrder(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(stripOrder);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as Record<string, unknown>)) {
      if (k === "order") continue;
      out[k] = stripOrder((x as Record<string, unknown>)[k]);
    }
    return out;
  }
  return x;
}
function contentEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(stripOrder(a)) === JSON.stringify(stripOrder(b));
}
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type Node = { id: string; order?: number } & Record<string, unknown>;

interface LevelCfg {
  scalars: string[];
  childrenKey?: string;
  child?: LevelCfg;
  label: (x: Node) => string;
}

const tabCfg: LevelCfg = { scalars: ["url", "title", "favicon"], label: (t) => String(t.title ?? t.url ?? "") };
const groupCfg: LevelCfg = { scalars: ["name"], childrenKey: "tabs", child: tabCfg, label: (g) => String(g.name ?? "") };
const categoryCfg: LevelCfg = { scalars: ["name"], childrenKey: "groups", child: groupCfg, label: (c) => String(c.name ?? "") };
const projectCfg: LevelCfg = { scalars: ["name"], childrenKey: "categories", child: categoryCfg, label: (p) => String(p.name ?? "") };
const spaceCfg: LevelCfg = {
  scalars: ["name", "icon", "color", "abbreviation"],
  childrenKey: "projects",
  child: projectCfg,
  label: (s) => String(s.name ?? ""),
};

function mergeScalars(
  base: Node | undefined,
  server: Node,
  local: Node,
  cfg: LevelCfg,
  path: string,
  conflicts: Conflict[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of cfg.scalars) {
    const bv = base?.[f], sv = server[f], lv = local[f];
    const sChanged = base ? !eq(bv, sv) : false;
    const lChanged = base ? !eq(bv, lv) : false;
    if (sChanged && lChanged && !eq(sv, lv)) {
      conflicts.push({ path, id: server.id, name: cfg.label(server), kind: "field", field: f, base: bv, server: sv, local: lv });
      out[f] = lv; // default: keep this device's value; resolver can override
    } else if (sChanged) out[f] = sv;
    else if (lChanged) out[f] = lv;
    else out[f] = sv; // unchanged
  }
  return out;
}

function mergeNode(base: Node | undefined, server: Node, local: Node, cfg: LevelCfg, path: string, conflicts: Conflict[]): Node {
  const node: Node = { ...server, ...mergeScalars(base, server, local, cfg, path, conflicts) };
  if (cfg.childrenKey && cfg.child) {
    const childPath = path ? `${path} / ${cfg.label(server)}` : cfg.label(server);
    node[cfg.childrenKey] = mergeList(
      base?.[cfg.childrenKey] as Node[] | undefined,
      (server[cfg.childrenKey] as Node[]) ?? [],
      (local[cfg.childrenKey] as Node[]) ?? [],
      cfg.child,
      childPath,
      conflicts,
    );
  }
  return node;
}

function mergeList(
  base: Node[] | undefined,
  server: Node[],
  local: Node[],
  cfg: LevelCfg,
  path: string,
  conflicts: Conflict[],
): Node[] {
  const bMap = new Map((base ?? []).map((x) => [x.id, x]));
  const sMap = new Map(server.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = [...new Set([...sMap.keys(), ...lMap.keys(), ...bMap.keys()])];

  const out: Node[] = [];
  for (const id of ids) {
    const b = bMap.get(id), s = sMap.get(id), l = lMap.get(id);

    if (s && l) {
      out.push(mergeNode(b, s, l, cfg, path, conflicts));
    } else if (s && !l) {
      if (!b) out.push(s); // added on server
      else if (!contentEq(b, s)) {
        // deleted on local, but edited on server → conflict (keep the edit by default)
        conflicts.push({ path, id: s.id, name: cfg.label(s), kind: "delete-edit", deletedOn: "local", server: s });
        out.push(s);
      } // else: server unchanged + local deleted → respect the delete
    } else if (!s && l) {
      if (!b) out.push(l); // added on local
      else if (!contentEq(b, l)) {
        // deleted on server, but edited on local → conflict (keep the edit by default)
        conflicts.push({ path, id: l.id, name: cfg.label(l), kind: "delete-edit", deletedOn: "server", local: l });
        out.push(l);
      } // else: local unchanged + server deleted → respect the delete
    }
    // !s && !l → deleted on both → gone
  }

  return out.map((x, i) => ({ ...x, order: i }));
}

/** 3-way merge of the spaces tree. `base` may be null (first sync) — then it degrades
 *  to a lossless union (everything kept, no deletes/conflicts detected). */
export function merge3(base: SavedSpace[] | null, server: SavedSpace[], local: SavedSpace[]): Merge3Result {
  const conflicts: Conflict[] = [];
  const merged = mergeList(
    base as Node[] | undefined,
    server as unknown as Node[],
    local as unknown as Node[],
    spaceCfg,
    "",
    conflicts,
  ) as unknown as SavedSpace[];
  return { merged, conflicts };
}
