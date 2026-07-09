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
  key: string; // stable identity for this conflict (path + id + field/kind)
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

// Per-conflict override, keyed by Conflict.key. "server" / "local" = which side's
// value to keep. For a delete-edit, the deleting side means "honor the delete"
// (drop the item); the other side means "keep the edit".
export type Resolutions = Record<string, "server" | "local">;

export interface Merge3Result {
  merged: SavedSpace[];
  conflicts: Conflict[];
}

// Deep-equal ignoring `order` (reorders aren't content changes / conflicts) and
// falsy optional fields (icon/color/abbreviation etc). Two different Yjs→JSON
// readers exist — yjsDoc.ts's per-level converters omit a falsy optional field
// from the object entirely, while background.ts's generic readYMap copies every
// key the Y.Map holds (including ones set to "" for unset). Same underlying
// data, two different JS shapes — comparing raw JSON would treat that shape
// difference as a real content change (and, worse, a false delete-edit
// conflict) whenever the merge base happens to come from the other reader.
function normalizeForCompare(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(normalizeForCompare);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as Record<string, unknown>)) {
      if (k === "order") continue;
      const v = (x as Record<string, unknown>)[k];
      if (v === "" || v === null || v === undefined) continue;
      out[k] = normalizeForCompare(v);
    }
    return out;
  }
  return x;
}
function contentEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
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
  resolutions: Resolutions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of cfg.scalars) {
    const bv = base?.[f], sv = server[f], lv = local[f];
    const sChanged = base ? !eq(bv, sv) : false;
    const lChanged = base ? !eq(bv, lv) : false;
    if (sChanged && lChanged && !eq(sv, lv)) {
      const key = `${path}::${server.id}::${f}`;
      conflicts.push({ key, path, id: server.id, name: cfg.label(server), kind: "field", field: f, base: bv, server: sv, local: lv });
      out[f] = resolutions[key] === "server" ? sv : lv; // default: keep this device's value
    } else if (sChanged) out[f] = sv;
    else if (lChanged) out[f] = lv;
    else out[f] = sv; // unchanged
  }
  return out;
}

function mergeNode(base: Node | undefined, server: Node, local: Node, cfg: LevelCfg, path: string, conflicts: Conflict[], resolutions: Resolutions): Node {
  const node: Node = { ...server, ...mergeScalars(base, server, local, cfg, path, conflicts, resolutions) };
  if (cfg.childrenKey && cfg.child) {
    const childPath = path ? `${path} / ${cfg.label(server)}` : cfg.label(server);
    node[cfg.childrenKey] = mergeList(
      base?.[cfg.childrenKey] as Node[] | undefined,
      (server[cfg.childrenKey] as Node[]) ?? [],
      (local[cfg.childrenKey] as Node[]) ?? [],
      cfg.child,
      childPath,
      conflicts,
      resolutions,
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
  resolutions: Resolutions,
): Node[] {
  const bMap = new Map((base ?? []).map((x) => [x.id, x]));
  const sMap = new Map(server.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = [...new Set([...sMap.keys(), ...lMap.keys(), ...bMap.keys()])];

  const out: Node[] = [];
  for (const id of ids) {
    const b = bMap.get(id), s = sMap.get(id), l = lMap.get(id);

    if (s && l) {
      out.push(mergeNode(b, s, l, cfg, path, conflicts, resolutions));
    } else if (s && !l) {
      if (!b) out.push(s); // added on server
      else if (!contentEq(b, s)) {
        // deleted on local, but edited on server → conflict (keep the edit by default)
        const key = `${path}::${s.id}::delete-edit`;
        conflicts.push({ key, path, id: s.id, name: cfg.label(s), kind: "delete-edit", deletedOn: "local", server: s });
        if (resolutions[key] !== "local") out.push(s); // "local" = honor the delete
      } // else: server unchanged + local deleted → respect the delete
    } else if (!s && l) {
      if (!b) out.push(l); // added on local
      else if (!contentEq(b, l)) {
        // deleted on server, but edited on local → conflict (keep the edit by default)
        const key = `${path}::${l.id}::delete-edit`;
        conflicts.push({ key, path, id: l.id, name: cfg.label(l), kind: "delete-edit", deletedOn: "server", local: l });
        if (resolutions[key] !== "server") out.push(l); // "server" = honor the delete
      } // else: local unchanged + server deleted → respect the delete
    }
    // !s && !l → deleted on both → gone
  }

  return out.map((x, i) => ({ ...x, order: i }));
}

/** 3-way merge of the spaces tree. `base` may be null (first sync) — then it degrades
 *  to a lossless union (everything kept, no deletes/conflicts detected). Pass
 *  `resolutions` to override a conflict's default (keyed by Conflict.key) — re-running
 *  merge3 with the user's choices yields the resolved tree. */
export function merge3(base: SavedSpace[] | null, server: SavedSpace[], local: SavedSpace[], resolutions: Resolutions = {}): Merge3Result {
  const conflicts: Conflict[] = [];
  const merged = mergeList(
    base as Node[] | undefined,
    server as unknown as Node[],
    local as unknown as Node[],
    spaceCfg,
    "",
    conflicts,
    resolutions,
  ) as unknown as SavedSpace[];
  return { merged, conflicts };
}
