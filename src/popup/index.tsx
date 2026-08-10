import { useState, useEffect } from "react"
import "@fontsource-variable/inter"
import "../../style.css"
import { useSavedSpacesStore, useHydrated } from "~src/store/useSavedSpacesStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { Button } from "~src/components/ui/button"
import {
  saveTabsAsGroup,
  defaultSavedGroupName,
} from "~src/services/saveTabsAsGroup"

function IndexPopup() {
  const hydrated = useHydrated();
  const { initialize, isAuthenticated, isLoading: authLoading, loginWithGoogle } = useAuthStore();
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { initialize(); }, []);

  const activeSpace = savedSpaces.find(s => s.id === activeSpaceId);
  const activeProject = activeSpace?.projects.find(p => p.id === activeProjectId);
  const activeCategory = activeProject?.categories.find(c => c.id === activeCategoryId);
  const hasActiveCategory = !!activeCategory;

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const target = hasActiveCategory
    ? {
        spaceId: activeSpace!.id,
        projectId: activeProject!.id,
        categoryId: activeCategory!.id,
      }
    : null;

  const handleSaveCurrentTab = async () => {
    if (!target) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const result = await saveTabsAsGroup({
      target,
      name: tab.title || "Saved Tab",
      tabs: [tab],
    });
    if (result) flashSaved();
  };

  const handleSaveAllTabs = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const result = await saveTabsAsGroup({
        target,
        name: defaultSavedGroupName("Window"),
        tabs,
      });
      if (result) flashSaved();
    } finally {
      setSaving(false);
    }
  };

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
        {saved && <span className="text-green-400 text-xs">Saved!</span>}
      </div>

      {hasActiveCategory && (
        <div className="text-white/40 text-xs mb-3 truncate">
          {activeSpace?.name} / {activeProject?.name} / {activeCategory?.name}
        </div>
      )}

      <div className="flex flex-col gap-2 mb-3">
        <Button variant="secondary" onClick={handleSaveCurrentTab} disabled={!hasActiveCategory || saving} className="w-full">
          Save Current Tab
        </Button>
        <Button variant="secondary" onClick={handleSaveAllTabs} disabled={!hasActiveCategory || saving} className="w-full">
          {saving ? 'Saving…' : 'Save All Tabs'}
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={() => chrome.tabs.create({ url: "chrome://newtab" })} className="w-full">
        Open FlexTab Dashboard
      </Button>

      {!hasActiveCategory && (
        <p className="text-white/30 text-xs mt-2 text-center">
          Open FlexTab and select a category to enable saving.
        </p>
      )}
    </div>
  )
}

export default IndexPopup
