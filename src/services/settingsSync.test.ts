import { describe, it, expect, vi } from "vitest";

// settingsSync reads the settings/auth stores at module load; stub them so the
// pure fieldMerge is importable without a real store.
vi.mock("~src/store/useSettingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ groupLayout: "grid", gridColumns: 3, density: "cozy", hue: 214, intensity: 100, autoSync: true }),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
}));
vi.mock("~src/store/useAuthStore", () => ({ useAuthStore: { getState: () => ({ isAuthenticated: true }) } }));
vi.mock("./api", () => ({ apiGetSettings: vi.fn(), apiPutSettings: vi.fn() }));

import { fieldMerge } from "./settingsSync";

const base = { groupLayout: "grid", gridColumns: 3, density: "cozy", hue: 214, intensity: 100, autoSync: true } as const;

describe("settings fieldMerge (field-level 3-way)", () => {
  it("keeps a field the local device changed since base", () => {
    const local = { ...base, hue: 30 }; // this device changed hue
    const remote = { ...base, hue: 200 }; // server still has the old-ish value
    expect(fieldMerge(base, remote, local).hue).toBe(30);
  });

  it("adopts a field the other device changed (local untouched)", () => {
    const local = { ...base }; // this device didn't touch density
    const remote = { ...base, density: "compact" as const }; // another device changed it
    expect(fieldMerge(base, remote, local).density).toBe("compact");
  });

  it("no clobber: local hue + remote density both survive", () => {
    const local = { ...base, hue: 30 };
    const remote = { ...base, density: "compact" as const };
    const merged = fieldMerge(base, remote, local);
    expect(merged.hue).toBe(30);
    expect(merged.density).toBe("compact");
  });

  it("null base → treat every field as locally changed (keep local)", () => {
    const local = { ...base, hue: 30 };
    const remote = { ...base, hue: 200, density: "compact" as const };
    const merged = fieldMerge(null, remote, local);
    expect(merged.hue).toBe(30);
    expect(merged.density).toBe("cozy"); // local value kept, not remote's
  });

  it("ignores remote fields that are undefined", () => {
    const local = { ...base };
    const remote = { hue: 200 }; // partial payload
    const merged = fieldMerge(base, remote, local);
    expect(merged.hue).toBe(200); // local unchanged → adopt remote
    expect(merged.autoSync).toBe(true); // absent remote field → keep local
  });
});
