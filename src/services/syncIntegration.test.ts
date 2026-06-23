import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SavedSpace } from '~src/types';

// Integration test: a fake backend (modelling the Go PUT /api/sync optimistic
// concurrency) driven by the REAL sync logic — decideReconciliation,
// resolveChoice, mergeSpaces and the OCC push loop (syncStructuredSnapshot).
// It proves data integrity (no lost tab) across guest-login and multi-device
// flows, end to end, without the browser.

const be = { spaces: [] as SavedSpace[], revision: 0 };
const deviceRev = new Map<string, number | null>();
let active = '';
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

vi.mock('~src/store/useSavedSpacesStore', () => ({ ensureDefaultData: vi.fn(), syncActiveSelection: vi.fn() }));
vi.mock('~src/store/useSyncConflict', () => ({ useSyncConflict: { getState: () => ({ open: vi.fn(), close: vi.fn() }) } }));

vi.mock('./api', () => ({
  pushSync: async (spaces: SavedSpace[], base: number | null) => {
    if (base !== be.revision) return { status: 'conflict', revision: be.revision, spaces: copy(be.spaces) };
    be.spaces = copy(spaces);
    be.revision += 1;
    return { status: 'ok', revision: be.revision };
  },
  fetchSyncRevision: async () => be.revision,
}));
vi.mock('./revision', () => ({
  getStoredRevision: async () => deviceRev.get(active) ?? null,
  setStoredRevision: async (r: number) => { deviceRev.set(active, r); },
}));

import { decideReconciliation, resolveChoice } from './syncEngine';
import { mergeSpaces } from './spacesMerge';
import { syncStructuredSnapshot } from './structuredSync';

const tab = (id: string) => ({ id, url: 'u' + id, title: id, favicon: '', order: 0 });
function space(id: string, name: string, tabs: ReturnType<typeof tab>[]): SavedSpace {
  return { id, name, order: 0, projects: [{ id: id + 'p', name: 'P', order: 0, categories: [{ id: id + 'c', name: 'C', order: 0, groups: [{ id: id + 'g', name: 'G', order: 0, tabs }] }] }] };
}
function tabIds(spaces: SavedSpace[]): string[] {
  const ids: string[] = [];
  for (const s of spaces) for (const p of s.projects) for (const c of p.categories) for (const g of c.groups) for (const t of g.tabs) ids.push(t.id);
  return ids.sort();
}

// A device with its own local state, talking to the shared fake backend through
// the real reconcile + OCC-push logic.
class Device {
  local: SavedSpace[] = [];
  constructor(public name: string) {}

  // Mirrors syncEngine.reconcile: pull, store the pulled revision, decide, apply.
  reconcile(fresh = false, choice: 'merge' | 'server' | 'local' = 'merge') {
    const server = copy(be.spaces);
    deviceRev.set(this.name, be.revision);
    const d = decideReconciliation(server, this.local, fresh);
    this.local = d.kind === 'conflict' ? resolveChoice(choice, server, this.local) : d.spaces;
  }

  // Mirrors the background OCC push (merges the server's 409 payload on conflict).
  async push() {
    active = this.name;
    await syncStructuredSnapshot(
      copy(this.local),
      async () => copy(this.local),
      (s, l) => mergeSpaces(s as SavedSpace[], l as SavedSpace[]),
    );
  }
}

beforeEach(() => {
  be.spaces = [];
  be.revision = 0;
  deviceRev.clear();
  active = '';
});

describe('sync integration — data integrity', () => {
  it('guest with tabs logs into an account with tabs → merge keeps both', async () => {
    be.spaces = [space('acc', 'Account', [tab('x')])];
    be.revision = 1;

    const d = new Device('D');
    d.local = [space('guest', 'Personal', [tab('y')])]; // guest-built locally
    d.reconcile(true, 'merge'); // explicit login → conflict → user picks merge
    await d.push();

    expect(tabIds(be.spaces)).toEqual(['x', 'y']);
  });

  it('empty guest login does not wipe the account', async () => {
    be.spaces = [space('acc', 'Account', [tab('x')])];
    be.revision = 1;

    const d = new Device('D');
    d.local = [space('def', 'Personal', [])]; // empty default placeholder
    d.reconcile(true); // local empty → take server, no prompt
    await d.push();

    expect(tabIds(be.spaces)).toEqual(['x']);
  });

  it('two devices editing the SAME space concurrently → no tab lost', async () => {
    be.spaces = [space('S', 'Work', [tab('base')])];
    be.revision = 1;

    const a = new Device('A');
    const b = new Device('B');
    a.reconcile(); // both pull at revision 1
    b.reconcile();
    a.local = [space('S', 'Work', [tab('base'), tab('A')])]; // A adds tab A
    b.local = [space('S', 'Work', [tab('base'), tab('B')])]; // B adds tab B

    await a.push(); // ok → server base+A
    await b.push(); // stale base → 409 → merge server(base+A) with local(base+B)

    expect(tabIds(be.spaces)).toEqual(['A', 'B', 'base']);
  });

  it('three devices each add a tab → all present after syncing', async () => {
    be.spaces = [space('S', 'Work', [tab('base')])];
    be.revision = 1;

    const ds = ['A', 'B', 'C'].map(n => new Device(n));
    ds.forEach(d => d.reconcile());
    ds[0].local = [space('S', 'Work', [tab('base'), tab('A')])];
    ds[1].local = [space('S', 'Work', [tab('base'), tab('B')])];
    ds[2].local = [space('S', 'Work', [tab('base'), tab('C')])];

    for (const d of ds) await d.push();

    expect(tabIds(be.spaces)).toEqual(['A', 'B', 'C', 'base']);
  });

  it('repeated reconcile + push keeps data stable (no duplication)', async () => {
    be.spaces = [space('S', 'Work', [tab('a')])];
    be.revision = 1;

    const a = new Device('A');
    for (let i = 0; i < 3; i++) { a.reconcile(); await a.push(); }

    expect(be.spaces).toHaveLength(1);
    expect(tabIds(be.spaces)).toEqual(['a']);
  });

  it('a device with local-only spaces never loses them to a concurrent push', async () => {
    be.spaces = [space('shared', 'Shared', [tab('s')])];
    be.revision = 1;

    const a = new Device('A');
    const b = new Device('B');
    a.reconcile();
    b.reconcile();
    a.local = [space('shared', 'Shared', [tab('s'), tab('a')])];
    b.local = [space('shared', 'Shared', [tab('s')]), space('bOnly', 'B Only', [tab('bx')])];

    await a.push();
    await b.push();

    // shared edit (a) + B's own space both survive
    expect(tabIds(be.spaces)).toEqual(['a', 'bx', 's']);
    expect(be.spaces.map(s => s.id).sort()).toEqual(['bOnly', 'shared']);
  });
});
