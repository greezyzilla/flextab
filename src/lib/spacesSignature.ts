import type { SavedSpace } from "~src/types";

/** Compare the complete persisted workspace schema, not an approximate subset.
 * Object key order and absent optional defaults are representation differences;
 * array position and explicit order values are both persisted content.
 * Keep the projection aligned with the Saved* types and Yjs conversion.
 */
export function spacesSignature(spaces: SavedSpace[]): string {
  return JSON.stringify((spaces || []).map(s => ({
    id: s.id, name: s.name, icon: s.icon || "", color: s.color || "",
    abbreviation: s.abbreviation || "", order: s.order ?? 0,
    projects: (s.projects || []).map(p => ({
      id: p.id, name: p.name, order: p.order ?? 0,
      categories: (p.categories || []).map(c => ({
        id: c.id, name: c.name, order: c.order ?? 0,
        groups: (c.groups || []).map(g => ({
          id: g.id, name: g.name, order: g.order ?? 0, color: g.color || "",
          tabs: (g.tabs || []).map(t => ({
            id: t.id, url: t.url, title: t.title, favicon: t.favicon, order: t.order ?? 0,
          })),
        })),
      })),
    })),
  })));
}
