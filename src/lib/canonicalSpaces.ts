import type { SavedSpace } from "~src/types";
import { spacesSignature } from "./spacesSignature";

// The one shape a workspace tree has on the sync path: every list in display
// order (by `order`, then position) with `order` renumbered to the position,
// and every id once per level.
//
// Why: the server stores `order` as the array position it receives, while the
// local document may hold a list whose position and `order` disagree (a new
// group is stored last with order -1 so it shows first). Pushing that raw tree
// moved the group on the server, and the merge base (what was pushed) never
// matched what the server returned, so every reconcile saw a "server change".
// Pushing, merging and comparing the canonical tree keeps base == server.
//
// Duplicate ids (left by an older whole-tree rewrite racing another context)
// are folded into the first copy: a list keeps the first item with an id and
// takes the children of the later copies into it, so no saved tab is dropped.
// An id already used elsewhere on the same level keeps its first place only.

type Node = { id: string; order?: number } & Record<string, unknown>;

const CHILDREN = ["projects", "categories", "groups", "tabs"] as const;

function inDisplayOrder<T extends { order?: number }>(list: T[]): T[] {
  return list
    .map((x, i) => ({ x, o: typeof x.order === "number" ? x.order : 0, i }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((e) => e.x);
}

/** Fold same-id copies in one list into the first, children united by id. */
function foldDuplicates(list: Node[], depth: number): Node[] {
  const key = CHILDREN[depth];
  const out: Node[] = [];
  const at = new Map<string, number>();
  for (const item of list) {
    const i = at.get(item.id);
    if (i === undefined) {
      at.set(item.id, out.length);
      out.push(item);
    } else if (key) {
      const first = out[i];
      out[i] = { ...first, [key]: [...((first[key] as Node[]) ?? []), ...((item[key] as Node[]) ?? [])] };
    }
  }
  return out;
}

function canonList(list: Node[], depth: number, seen: Set<string>[]): Node[] {
  const key = CHILDREN[depth];
  const level = seen[depth];
  const kept = foldDuplicates(inDisplayOrder(list ?? []), depth).filter((x) => {
    if (level.has(x.id)) return false;
    level.add(x.id);
    return true;
  });
  return kept.map((x, i) => {
    const node: Node = { ...x, order: i };
    if (key) node[key] = canonList((x[key] as Node[]) ?? [], depth + 1, seen);
    return node;
  });
}

export function canonicalSpaces(spaces: SavedSpace[]): SavedSpace[] {
  const seen = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
  return canonList((spaces ?? []) as unknown as Node[], 0, seen) as unknown as SavedSpace[];
}

/** Same workspace as shown: equal once both are canonical. */
export function sameTree(a: SavedSpace[] | null | undefined, b: SavedSpace[] | null | undefined): boolean {
  return spacesSignature(canonicalSpaces(a ?? [])) === spacesSignature(canonicalSpaces(b ?? []));
}
