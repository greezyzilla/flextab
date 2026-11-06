import { useState, useEffect, useRef } from "react"
import { WorkspaceLoadError } from "~src/components/WorkspaceLoadError"
import "@fontsource-variable/inter"
import "../../style.css"
import { useSavedSpacesStore, useHydrated } from "~src/store/useSavedSpacesStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { installExternalPersistBridge, persistState } from "~src/lib/yjsDoc"
import { Button } from "~src/components/ui/button"
import {
  saveTabsAsGroup,
  defaultSavedGroupName,
} from "~src/services/saveTabsAsGroup"
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"
import { resolveSaveTargetIds } from "~src/services/resolveSaveTarget"
import { DestinationPicker, describeTarget } from "~src/components/DestinationPicker"

function IndexPopup() {
  const { hydrated, error: hydrationError } = useHydrated();
  const { initialize, isAuthenticated, isLoading: authLoading, loginWithGoogle } = useAuthStore();
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const mounted = useRef(true);
  // A failed flush leaves the group in this popup's Y.Doc. Retry that same write,
  // rather than creating a duplicate group or requiring another tabs query.
  const pendingSave = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { initialize(); }, []);
  useEffect(() => {
    if (hydrated) installExternalPersistBridge();
  }, [hydrated]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  // Default: the category last used in the new tab page (same as before), so
  // a plain save is still one click. Changing it is local to this popup.
  const [chosen, setChosen] = useState<SaveTabsTarget | null>(null);
  const [picking, setPicking] = useState(false);
  const fallback = resolveSaveTargetIds(savedSpaces, {
    spaceId: activeSpaceId, projectId: activeProjectId, categoryId: activeCategoryId,
  });
  const candidate = chosen ?? fallback;
  const destination = describeTarget(savedSpaces, candidate);
  const hasActiveCategory = !!destination;

  const flashSaved = () => {
    if (!mounted.current) return;
    setSaved(true);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  };

  const target = hasActiveCategory ? candidate : null;

  const save = async (mode: "current" | "all" | "retry") => {
    if (savingRef.current || (mode !== "retry" && (!target || pendingSave.current))) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setError("");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    try {
      if (mode !== "retry") {
        const tabs = await chrome.tabs.query(mode === "current"
          ? { active: true, currentWindow: true }
          : { currentWindow: true });
        const result = await saveTabsAsGroup({
          target: target!,
          name: mode === "current" ? tabs[0]?.title || "Saved Tab" : defaultSavedGroupName("Window"),
          tabs: mode === "current" ? tabs.slice(0, 1) : tabs,
        });
        if (!result) {
          setError("No tabs were saved. Check the destination and try a regular web page.");
          return;
        }
        pendingSave.current = true;
      }
      // The popup owns a separate Y.Doc, and may be the only open extension UI.
      // Await the shared persistence queue before acknowledging success. A
      // new-tab observer or a running cloud sync worker is not required.
      await persistState();
      pendingSave.current = false;
      flashSaved();
    } catch (_) {
      setError(pendingSave.current
        ? "Could not save to this device. Keep this popup open and retry."
        : "Could not read your tabs. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (hydrationError) return <div className="w-72"><WorkspaceLoadError /></div>;

  if (authLoading) {
    return (
      <div className="w-72 bg-black-900 p-4 font-sans">
        <div className="text-white/50 text-xs text-center">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="w-72 bg-black-900 p-4 font-sans flex flex-col items-center gap-3">
        <h2 className="text-white/90 text-base font-medium">FlexTab</h2>
        <p className="text-white/40 text-xs text-center">Sign in to save and sync your tabs.</p>
        <Button variant="secondary" onClick={loginWithGoogle} className="w-full">Sign in</Button>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="w-72 bg-black-900 p-4 font-sans">
        <div className="text-white/50 text-xs text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-72 bg-black-900 p-4 font-sans">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white/90 text-base font-medium">FlexTab</h2>
        {saved && <span role="status" className="text-green-400 text-xs">Saved locally!</span>}
      </div>

      <div className="mb-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setPicking(p => !p)}
          aria-expanded={picking}
          className="w-full flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left text-xs hover:bg-white/[0.06] outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate text-white/75">
            <span className="text-white/50">Save to </span>{destination ?? "Choose a destination"}
          </span>
          <span aria-hidden className="text-white/50">{picking ? "▴" : "▾"}</span>
        </button>
        {picking && (
          <DestinationPicker
            value={candidate}
            onChange={(t) => { setChosen(t); setPicking(false); }}
            maxHeightClass="max-h-52"
          />
        )}
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <Button variant="secondary" onClick={() => void save("current")} disabled={!hasActiveCategory || saving || pendingSave.current} className="w-full">
          Save Current Tab
        </Button>
        <Button variant="secondary" onClick={() => void save("all")} disabled={!hasActiveCategory || saving || pendingSave.current} className="w-full">
          {saving ? 'Saving…' : 'Save All Tabs'}
        </Button>
      </div>

      {saving && <p role="status" className="text-white/50 text-xs mb-3">Saving to this device…</p>}
      {error && (
        <div className="mb-3">
          <p role="alert" className="text-red-400 text-xs">{error}</p>
          {pendingSave.current && (
            <Button variant="secondary" onClick={() => void save("retry")} disabled={saving} className="w-full mt-2">
              Retry Save
            </Button>
          )}
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={() => chrome.tabs.create({ url: "chrome://newtab" })} className="w-full">
        Open FlexTab Dashboard
      </Button>

    </div>
  )
}

export default IndexPopup
