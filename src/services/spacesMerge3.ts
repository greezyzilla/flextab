// Production 3-way merge for the spaces tree (base = last-synced snapshot).
//
// **This is the OCC / multi-device path (FE-C3).** Background 409 writeback and
// reconcile-with-base call merge3 only. Guest sign-in without a shared history
// uses the legacy 2-way in `spacesMerge` (mergeSpacesGuest) instead.
//
// Pure + dependency-free. Matches items by stable id at every level
// (space → project → category → group → tab):
//   - changed on one side only        → auto-apply (silent)
//   - same field changed both sides   → conflict (default: keep local)
//   - delete on one side, edit other  → conflict (default: keep the edit)
//   - delete + unchanged other        → respect the delete (drop it)
//   - delete on both                  → gone
//   - add with a new id (incl. same name) → kept (no conflict — different ids)
//   - moved to another parent on one side → it moves, and its content still
//     merges 3-way at the new place
//   - moved to different parents on both sides → conflict on "location"
//     (default: keep this device's place)
//   - moved on one side, deleted on the other → delete-edit (a move is an edit)
// `order` is never a conflict. Each list keeps the order of the side that
// changed it since the base (this device's when both did); items added on
// one side stay next to the neighbour they were added after.
//
// See SYNC_CONFLICT.md for the design + test matrix.

import type { SavedSpace } from "~src/types";

/** Re-export tree helper so OCC callers need one merge-related import. */
export { spaceTabCount } from "./spacesTree";

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
  movedTo?: string; // for a "delete-edit" whose kept side moved the item: where to, e.g. "Work › Docs"
  movedIn?: string; // for a "delete-edit" on a container the kept side moved an item into: that item's name
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
// empty optional fields (icon/color/abbreviation etc as "", null, or missing).
// Readers may still differ at the edges; normalize so shape noise is never a
// content change (false delete-edit or false field conflict). FE-B2: scalar
// merges use the same empty-as-absent rule via scalarEq.
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
/** Field-level equal: missing / null / "" are the same "unset" value. */
function scalarEq(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

type Node = { id: string; order?: number } & Record<string, unknown>;

interface LevelCfg {
  scalars: string[];
  childrenKey?: string;
  child?: LevelCfg;
  label: (x: Node) => string;
}

const tabCfg: LevelCfg = { scalars: ["url", "title", "favicon"], label: (t) => String(t.title ?? t.url ?? "") };
const groupCfg: LevelCfg = { scalars: ["name", "color"], childrenKey: "tabs", child: tabCfg, label: (g) => String(g.name ?? "") };
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
    const sChanged = base ? !scalarEq(bv, sv) : false;
    const lChanged = base ? !scalarEq(bv, lv) : false;
    if (sChanged && lChanged && !scalarEq(sv, lv)) {
      const key = `${path}::${server.id}::${f}`;
      conflicts.push({ key, path, id: server.id, name: cfg.label(server), kind: "field", field: f, base: bv, server: sv, local: lv });
      out[f] = resolutions[key] === "server" ? sv : lv; // default: keep this device's value
    } else if (sChanged) out[f] = sv;
    else if (lChanged) out[f] = lv;
    else out[f] = sv; // unchanged
  }
  return out;
}

interface Ctx {
  conflicts: Conflict[];
  resolutions: Resolutions;
  /** Items moved since the base, by `${depth}:${id}`: which side moved them, and where to. */
  moved: Map<string, { server: boolean; local: boolean; to: string }>;
  /** Containers an item was moved into, by `${depth}:${id}`: on which side, and the item's name. */
  movedInto: Map<string, { server?: string; local?: string }>;
}

const LEVEL_CFGS = [spaceCfg, projectCfg, categoryCfg, groupCfg, tabCfg];
const placeKey = (depth: number, id: string) => `${depth}:${id}`;

function mergeNode(base: Node | undefined, server: Node, local: Node, cfg: LevelCfg, depth: number, path: string, ctx: Ctx): Node {
  const node: Node = { ...server, ...mergeScalars(base, server, local, cfg, path, ctx.conflicts, ctx.resolutions) };
  if (cfg.childrenKey && cfg.child) {
    const childPath = path ? `${path} / ${cfg.label(server)}` : cfg.label(server);
    node[cfg.childrenKey] = mergeList(
      base?.[cfg.childrenKey] as Node[] | undefined,
      (server[cfg.childrenKey] as Node[]) ?? [],
      (local[cfg.childrenKey] as Node[]) ?? [],
      cfg.child,
      depth + 1,
      childPath,
      ctx,
    );
  }
  return node;
}

function mergeList(
  base: Node[] | undefined,
  server: Node[],
  local: Node[],
  cfg: LevelCfg,
  depth: number,
  path: string,
  ctx: Ctx,
): Node[] {
  const { conflicts, resolutions } = ctx;
  const bMap = new Map((base ?? []).map((x) => [x.id, x]));
  const sMap = new Map(server.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const ids = [...new Set([...sMap.keys(), ...lMap.keys(), ...bMap.keys()])];

  const out: Node[] = [];
  for (const id of ids) {
    const b = bMap.get(id), s = sMap.get(id), l = lMap.get(id);
    const moved = ctx.moved.get(placeKey(depth, id));
    const into = ctx.movedInto.get(placeKey(depth, id));

    if (s && l) {
      out.push(mergeNode(b, s, l, cfg, depth, path, ctx));
    } else if (s && !l) {
      if (!b) out.push(s); // added on server
      else if (!contentEq(b, s) || moved?.server || into?.server) {
        // deleted on local, but edited (or moved, or moved into) on server → conflict (keep the edit by default)
        const key = `${path}::${s.id}::delete-edit`;
        conflicts.push({
          key, path, id: s.id, name: cfg.label(s), kind: "delete-edit", deletedOn: "local", server: s,
          ...(moved?.server ? { movedTo: moved.to } : {}), ...(into?.server ? { movedIn: into.server } : {}),
        });
        if (resolutions[key] !== "local") out.push(s); // "local" = honor the delete
      } // else: server unchanged + local deleted → respect the delete
    } else if (!s && l) {
      if (!b) out.push(l); // added on local
      else if (!contentEq(b, l) || moved?.local || into?.local) {
        // deleted on server, but edited (or moved, or moved into) on local → conflict (keep the edit by default)
        const key = `${path}::${l.id}::delete-edit`;
        conflicts.push({
          key, path, id: l.id, name: cfg.label(l), kind: "delete-edit", deletedOn: "server", local: l,
          ...(moved?.local ? { movedTo: moved.to } : {}), ...(into?.local ? { movedIn: into.local } : {}),
        });
        if (resolutions[key] !== "server") out.push(l); // "server" = honor the delete
      } // else: local unchanged + server deleted → respect the delete
    }
    // !s && !l → deleted on both → gone
  }

  return orderList(base ?? [], server, local, out).map((x, i) => ({ ...x, order: i }));
}

// --- Order ---
//
// Lists used to come out in the server's order, so a reorder made on this
// device was lost whenever a merge ran (reconnect, another device's change,
// Sync now) and the merged tree was applied back here.

/** Ids in display order: by `order`, then by position (groups and tabs are shown sorted by `order`). */
function displayIds(list: Node[]): string[] {
  return list.map((x, i) => ({ id: x.id, o: typeof x.order === "number" ? x.order : 0, i }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.id);
}

/** Whether `side` orders the items it shares with `base` differently. */
function reordered(base: string[], side: string[]): boolean {
  const inBase = new Set(base), inSide = new Set(side);
  const a = side.filter((id) => inBase.has(id)), b = base.filter((id) => inSide.has(id));
  return a.some((id, i) => id !== b[i]);
}

function orderList(base: Node[], server: Node[], local: Node[], merged: Node[]): Node[] {
  const b = displayIds(base), s = displayIds(server), l = displayIds(local);
  // The side that reordered leads; with both, this device (as for any other change).
  const [lead, other] = reordered(b, l) ? [l, s] : [s, l];
  const byId = new Map(merged.map((x) => [x.id, x]));
  const ids = lead.filter((id) => byId.has(id));
  const known = new Set([...b, ...other]);
  // An item only the other side has goes right after its nearest neighbour
  // there, past anything the leading side added at that spot (both added
  // after the same item: the leading side's comes first, like a rebase).
  other.forEach((id, i) => {
    if (!byId.has(id) || ids.includes(id)) return;
    let j = i - 1;
    while (j >= 0 && !ids.includes(other[j])) j--;
    let at = j < 0 ? 0 : ids.indexOf(other[j]) + 1;
    while (at < ids.length && !known.has(ids[at])) at++;
    ids.splice(at, 0, id);
  });
  return ids.map((id) => byId.get(id)!);
}

// --- Moves ---
//
// The per-level merge matches items inside one parent, so a move would read as
// "deleted here, added there": with an edit or another move on the other side,
// the item came out in two places, and the server rejects a tree with a
// duplicate id. Before merging, every item that changed parent is placed at
// its final parent in all three trees, so the per-level merge meets the three
// versions of it in one place and merges its content as usual.

interface Place {
  depth: number;
  node: Node;
  /** Ancestor ids, outermost first; the last one is the parent. */
  ancestors: string[];
  /** Ancestor names, outermost first. */
  names: string[];
}

function places(tree: Node[]): Map<string, Place> {
  const out = new Map<string, Place>();
  const walk = (nodes: Node[] | undefined, depth: number, ancestors: string[], names: string[]) => {
    const cfg = LEVEL_CFGS[depth];
    for (const node of nodes ?? []) {
      out.set(placeKey(depth, node.id), { depth, node, ancestors, names });
      if (cfg.childrenKey) walk(node[cfg.childrenKey] as Node[] | undefined, depth + 1, [...ancestors, node.id], [...names, cfg.label(node)]);
    }
  };
  walk(tree, 0, [], []);
  return out;
}

const parentOf = (p: Place) => p.ancestors[p.ancestors.length - 1];

/** The list holding the item at `depth` with `id`, searched through the whole tree. */
function findIn(tree: Node[], depth: number, id: string): { node: Node; list: Node[] } | null {
  const walk = (list: Node[], d: number): { node: Node; list: Node[] } | null => {
    for (const node of list) {
      if (d === depth) { if (node.id === id) return { node, list }; continue; }
      // d < depth, so this level always has children.
      const hit = walk((node[LEVEL_CFGS[d].childrenKey!] as Node[] | undefined) ?? [], d + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(tree, 0);
}

function childrenOf(node: Node, depth: number): Node[] {
  const key = LEVEL_CFGS[depth].childrenKey!;
  if (!Array.isArray(node[key])) node[key] = [];
  return node[key] as Node[];
}

interface Move {
  depth: number;
  id: string;
  target: string;
  /** The target parent and its ancestors, outermost first, as the moving side has them. */
  chain: Place[];
  /** The target parent is new since the base, so a tree without it gets an empty copy. */
  newParent: boolean;
}

/** Put the item at its final parent in `tree` (mutated). An item missing here was deleted on this side. */
function relocate(tree: Node[], m: Move): void {
  const hit = findIn(tree, m.depth, m.id);
  if (!hit) return;
  hit.list.splice(hit.list.indexOf(hit.node), 1);
  let parent = findIn(tree, m.depth - 1, m.target)?.node;
  if (!parent && m.newParent) {
    // Rebuild the missing part of the path as empty copies of the moving side's
    // containers; merged with the real ones, they add nothing of their own.
    let list = tree;
    for (const anc of m.chain) {
      let node = findIn(tree, anc.depth, anc.node.id)?.node;
      if (!node) {
        const key = LEVEL_CFGS[anc.depth].childrenKey!;
        node = { ...anc.node, [key]: [] };
        list.push(node);
      }
      list = childrenOf(node, anc.depth);
      parent = node;
    }
  }
  // The target was deleted on this side: the item is dropped here with it. The
  // other side still has the target with the item inside, which surfaces as a
  // delete-edit conflict on the target (kept by default).
  if (parent) childrenOf(parent, m.depth - 1).push(hit.node);
}

function planMoves(base: Node[], server: Node[], local: Node[], ctx: Ctx): Move[] {
  const bP = places(base), sP = places(server), lP = places(local);
  const moves: Move[] = [];
  for (const [key, b] of bP) {
    if (b.depth === 0) continue; // spaces have no parent
    const s = sP.get(key), l = lP.get(key);
    const sMoved = !!s && parentOf(s) !== parentOf(b);
    const lMoved = !!l && parentOf(l) !== parentOf(b);
    if (!sMoved && !lMoved) continue;
    const cfg = LEVEL_CFGS[b.depth];
    const id = b.node.id;
    let fromLocal = lMoved;
    if (sMoved && lMoved && parentOf(s!) !== parentOf(l!)) {
      const path = b.names.join(" / ");
      const conflictKey = `${path}::${id}::location`;
      ctx.conflicts.push({
        key: conflictKey, path, id, name: cfg.label(b.node), kind: "field", field: "location",
        base: b.names.join(" › "), server: s!.names.join(" › "), local: l!.names.join(" › "),
      });
      fromLocal = ctx.resolutions[conflictKey] !== "server"; // default: keep this device's place
    }
    const mover = fromLocal ? l! : s!;
    const target = parentOf(mover);
    const moverPlaces = fromLocal ? lP : sP;
    const chain = mover.ancestors.map((ancId, depth) => moverPlaces.get(placeKey(depth, ancId))!);
    ctx.moved.set(key, { server: sMoved, local: lMoved, to: mover.names.join(" › ") });
    // Receiving an item is a change to every container on its new path: the
    // other side deleting one of them must not drop the item silently.
    const side = fromLocal ? "local" : "server";
    for (const anc of chain) {
      const k = placeKey(anc.depth, anc.node.id);
      ctx.movedInto.set(k, { ...ctx.movedInto.get(k), [side]: cfg.label(mover.node) });
    }
    moves.push({ depth: b.depth, id, target, chain, newParent: !bP.has(placeKey(b.depth - 1, target)) });
  }
  // Parents first, so a child's target is already where it ends up.
  return moves.sort((a, b) => a.depth - b.depth);
}

const cloneTree = (t: Node[]): Node[] => JSON.parse(JSON.stringify(t));

/** 3-way merge of the spaces tree. `base` may be null (first sync) — then it degrades
 *  to a lossless union (everything kept, no deletes/conflicts detected). Pass
 *  `resolutions` to override a conflict's default (keyed by Conflict.key) — re-running
 *  merge3 with the user's choices yields the resolved tree. */
export function merge3(base: SavedSpace[] | null, server: SavedSpace[], local: SavedSpace[], resolutions: Resolutions = {}): Merge3Result {
  const ctx: Ctx = { conflicts: [], resolutions, moved: new Map(), movedInto: new Map() };
  let b = base as unknown as Node[] | null, s = server as unknown as Node[], l = local as unknown as Node[];
  // Without a base there is no history to tell a move from an add, so nothing moves.
  const moves = b ? planMoves(b, s, l, ctx) : [];
  if (moves.length) {
    b = cloneTree(b!); s = cloneTree(s); l = cloneTree(l);
    for (const m of moves) for (const tree of [b, s, l]) relocate(tree, m);
  }
  const merged = mergeList(b ?? undefined, s, l, spaceCfg, 0, "", ctx) as unknown as SavedSpace[];
  return { merged, conflicts: ctx.conflicts };
}
