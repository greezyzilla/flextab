import { BookmarkPlus, FolderInput } from "lucide-react";
import { useEffect, useState } from "react";
import { Switch } from "~src/components/ui/switch";
import { loadCloseAfter, saveCloseAfter, type CloseAfter } from "~src/services/capture";
import { loadRememberDestinations, saveRememberDestinations } from "~src/lib/recentDestinations";
import { SettingRow, SettingsPage, SettingsSection } from "./shared";

/**
 * Settings › Saving: whether saving a tab also closes it, one switch
 * per way of saving, because the same person wants different things from
 * each. All off until turned on; every close can be undone.
 */
const ROWS: { kind: CloseAfter; label: string; description: string; info?: string }[] = [
  { kind: "drag", label: "Close after dragging a tab in", description: "The tab closes once it is in your workspace.", info: "An open tab you drag into your workspace, or save with its Save button, closes." },
  { kind: "window", label: "Close after saving a window", description: "Saving a window as a group closes its tabs." },
  { kind: "saveAll", label: "Close after Save all tabs", description: "Save all tabs closes the tabs it saves." },
  { kind: "popup", label: "Close after saving from the popup", description: "What you save from the toolbar button closes.", info: "What you save from the FlexTab button in the toolbar closes. The page you're on closes when the popup does." },
];

export function SavingTab() {
  const [values, setValues] = useState<Partial<Record<CloseAfter, boolean>>>({});
  const [remember, setRemember] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all(ROWS.map(async (r) => [r.kind, await loadCloseAfter(r.kind)] as const))
      .then((pairs) => { if (alive) setValues(Object.fromEntries(pairs)); });
    void loadRememberDestinations().then((v) => { if (alive) setRemember(v); });
    return () => { alive = false; };
  }, []);

  const changeRemember = (value: boolean) => {
    setRemember(value);
    void saveRememberDestinations(value);
  };

  const change = (kind: CloseAfter, value: boolean) => {
    setValues((v) => ({ ...v, [kind]: value }));
    void saveCloseAfter(kind, value);
  };

  return (
    <SettingsPage>
      <SettingsSection title="Saving and closing" icon={BookmarkPlus} subtitle="What happens to a tab after you save it.">
      {ROWS.map((row) => (
        <SettingRow key={row.kind} label={row.label} description={row.description} info={row.info}>
          {(controlProps) => (
            <div className="flex items-center gap-2">
              <Switch {...controlProps} checked={values[row.kind] ?? false} onCheckedChange={(v) => change(row.kind, v)} />
              <span className="text-fg-muted text-sm font-sans">{values[row.kind] ? "On" : "Off"}</span>
            </div>
          )}
        </SettingRow>
      ))}
      </SettingsSection>
      {/* Where a save goes when you don't pick. */}
      <SettingsSection title="Where saves go" icon={FolderInput} subtitle="Where a saved tab lands.">
      <SettingRow
        label="Remember where I last saved"
        description="The popup suggests the group you last saved to. When off, nothing is suggested: you pick a group each time, and the shortcuts and right-click menu open the popup to ask."
      >
        {(controlProps) => (
          <div className="flex items-center gap-2">
            <Switch {...controlProps} checked={remember ?? true} disabled={remember === null} onCheckedChange={changeRemember} />
            <span className="text-fg-muted text-sm font-sans">{remember ?? true ? "On" : "Off"}</span>
          </div>
        )}
      </SettingRow>
      </SettingsSection>
    </SettingsPage>
  );
}
