import { useEffect, useState } from "react";
import { Switch } from "~src/components/ui/switch";
import { loadCloseAfter, saveCloseAfter, type CloseAfter } from "~src/services/capture";
import { GroupHeading, SettingRow } from "./shared";

/**
 * Settings › Saving (TASK-60): whether saving a tab also closes it, one switch
 * per way of saving, because the same person wants different things from
 * each. All off until turned on; every close can be undone.
 */
const ROWS: { kind: CloseAfter; label: string; description: string }[] = [
  { kind: "drag", label: "Close after dragging a tab in", description: "An open tab you drag into your workspace, or save with its Save button, closes." },
  { kind: "window", label: "Close after saving a window", description: "Saving a window as a group closes its tabs." },
  { kind: "saveAll", label: "Close after Save all tabs", description: "Save all tabs closes the tabs it saves." },
  { kind: "popup", label: "Close after saving from the popup", description: "What you save from the FlexTab button in the toolbar closes. The page you're on closes when the popup does." },
];

export function SavingTab() {
  const [values, setValues] = useState<Partial<Record<CloseAfter, boolean>>>({});
  useEffect(() => {
    let alive = true;
    void Promise.all(ROWS.map(async (r) => [r.kind, await loadCloseAfter(r.kind)] as const))
      .then((pairs) => { if (alive) setValues(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, []);

  const change = (kind: CloseAfter, value: boolean) => {
    setValues((v) => ({ ...v, [kind]: value }));
    void saveCloseAfter(kind, value);
  };

  return (
    <section className="flex flex-col gap-7">
      <GroupHeading>Saving &amp; closing</GroupHeading>
      {ROWS.map((row) => (
        <SettingRow key={row.kind} label={row.label} description={row.description}>
          {(controlProps) => (
            <div className="flex items-center gap-2">
              <Switch {...controlProps} checked={values[row.kind] ?? false} onCheckedChange={(v) => change(row.kind, v)} />
              <span className="text-fg-muted text-sm font-sans">{values[row.kind] ? "On" : "Off"}</span>
            </div>
          )}
        </SettingRow>
      ))}
    </section>
  );
}
