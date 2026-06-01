import { useState, useEffect } from "react"
import "../../style.css"
import { useSavedSpacesStore, useHydrated } from "~src/store/useSavedSpacesStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { v7 as uuidv7 } from "uuid"
import type { SavedTab } from "~src/types"
import { faviconToDataUrl } from "~src/utils/favicon"

function IndexPopup() {
  const hydrated = useHydrated();
  const { initialize, isAuthenticated, isLoading: authLoading, login } = useAuthStore();
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId, addSavedGroup, addSavedTab } = useSavedSpacesStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { initialize(); }, []);

  const activeSpace = savedSpaces.find(s => s.id === activeSpaceId);
  const activeProject = activeSpace?.projects.find(p => p.id === activeProjectId);
  const activeCategory = activeProject?.categories.find(c => c.id === activeCategoryId);
  const hasActiveCategory = !!activeCategory;

  const handleSaveCurrentTab = async () => {
    if (!activeSpace || !activeProject || !activeCategory) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const groupId = uuidv7();
    addSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, {
      id: groupId,
      name: tab.title || 'Saved Tab',
      tabs: [],
      order: activeCategory.groups.length,
    });

    const favicon = await faviconToDataUrl(tab.favIconUrl || '');
    const savedTab: SavedTab = {
      id: uuidv7(),
      url: tab.url,
      title: tab.title || 'Untitled',
      favicon,
      order: 0,
    };
    addSavedTab(activeSpace.id, activeProject.id, activeCategory.id, groupId, savedTab);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveAllTabs = async () => {
    if (!activeSpace || !activeProject || !activeCategory) return;
    setSaving(true);

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const filteredTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://'));
    if (filteredTabs.length === 0) { setSaving(false); return; }

    const groupId = uuidv7();
    const groupName = `Window ${new Date().toLocaleDateString()}`;

    addSavedGroup(activeSpace.id, activeProject.id, activeCategory.id, {
      id: groupId,
      name: groupName,
      tabs: [],
      order: activeCategory.groups.length,
    });

    for (let i = 0; i < filteredTabs.length; i++) {
      const tab = filteredTabs[i];
      const favicon = await faviconToDataUrl(tab.favIconUrl || '');
      addSavedTab(activeSpace.id, activeProject.id, activeCategory.id, groupId, {
        id: uuidv7(),
        url: tab.url || '',
        title: tab.title || 'Untitled',
        favicon,
        order: i,
      });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        <button
          onClick={login}
          className="w-full px-3 py-2 bg-white/10 text-white/80 rounded-md hover:bg-white/20 transition-colors text-sm"
        >
          Sign in with Google
        </button>
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
        <button
          onClick={handleSaveCurrentTab}
          disabled={!hasActiveCategory || saving}
          className="w-full px-3 py-2 bg-white/10 text-white/80 rounded-md hover:bg-white/20 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Save Current Tab
        </button>
        <button
          onClick={handleSaveAllTabs}
          disabled={!hasActiveCategory || saving}
          className="w-full px-3 py-2 bg-white/10 text-white/80 rounded-md hover:bg-white/20 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save All Tabs'}
        </button>
      </div>

      <button
        onClick={() => chrome.tabs.create({ url: "chrome://newtab" })}
        className="w-full px-3 py-2 bg-white/5 text-white/60 rounded-md hover:bg-white/10 transition-colors text-xs"
      >
        Open FlexTab Dashboard
      </button>

      {!hasActiveCategory && (
        <p className="text-white/30 text-xs mt-2 text-center">
          Open FlexTab and select a category to enable saving.
        </p>
      )}
    </div>
  )
}

export default IndexPopup
