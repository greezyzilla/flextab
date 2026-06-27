import { useState, useMemo, useRef, useEffect } from "react";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { useWindows } from "~src/hooks/useWindows";
import { FaviconImg } from "./FaviconImg";
import { Badge } from "./ui/badge";

interface SearchResult {
  type: 'saved' | 'opened';
  title: string;
  url: string;
  favicon: string;
  tabId?: number;
  windowId?: number;
  breadcrumb?: string;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { savedSpaces } = useSavedSpacesStore();
  const { windows } = useWindows({ populate: true });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setQuery("");
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const matches: SearchResult[] = [];

    // Search saved tabs
    for (const space of savedSpaces) {
      for (const project of space.projects) {
        for (const category of project.categories) {
          for (const group of category.groups) {
            for (const tab of group.tabs) {
              if (tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q)) {
                matches.push({
                  type: 'saved',
                  title: tab.title,
                  url: tab.url,
                  favicon: tab.favicon,
                  breadcrumb: `${space.name} / ${project.name} / ${category.name} / ${group.name}`,
                });
              }
            }
          }
        }
      }
    }

    // Search opened tabs
    for (const window of windows) {
      for (const tab of window.tabs ?? []) {
        if (!tab.url || tab.url.startsWith('chrome://')) continue;
        if ((tab.title ?? '').toLowerCase().includes(q) || tab.url.toLowerCase().includes(q)) {
          matches.push({
            type: 'opened',
            title: tab.title ?? '',
            url: tab.url,
            favicon: tab.favIconUrl ?? '',
            tabId: tab.id,
            windowId: window.id,
          });
        }
      }
    }

    return matches.slice(0, 20);
  }, [query, savedSpaces, windows]);

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'opened' && result.tabId && result.windowId) {
      chrome.tabs.update(result.tabId, { active: true });
      chrome.windows.update(result.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: result.url });
    }
    setQuery("");
    inputRef.current?.blur();
  };

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(-1); }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleResultClick(results[selectedIndex]);
    }
  };

  const showDropdown = isFocused && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-lg">
      <div className="flex items-center gap-2 bg-white/5 rounded-md px-3 py-1.5 border border-white/10 focus-within:border-white/30 transition-colors">
        <svg className="w-4 h-4 text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder="Search tabs... (Cmd+K)"
          className="flex-1 bg-transparent text-white/80 text-sm placeholder-white/30 outline-none font-sans"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-white/30 hover:text-white/50 text-xs">
            ✕
          </button>
        )}
      </div>

      {showDropdown && (
        <div ref={listRef} className="absolute top-full left-0 right-0 mt-1 bg-black-800 border border-white/10 rounded-md shadow-lg max-h-80 overflow-y-auto z-50">
          {results.length > 0 ? (
            results.map((result, i) => (
              <button
                key={`${result.type}-${result.url}-${i}`}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${i === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <FaviconImg src={result.favicon} alt={result.title} className="w-4 h-4 shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-white/80 text-xs truncate">{result.title}</div>
                  <div className="text-white/40 text-xs truncate">{result.url}</div>
                  {result.breadcrumb && (
                    <div className="text-white/30 text-xs truncate">{result.breadcrumb}</div>
                  )}
                </div>
                <Badge variant={result.type === 'saved' ? 'accent' : 'success'} className="shrink-0 font-normal">
                  {result.type === 'saved' ? 'saved' : 'open'}
                </Badge>
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-white/40 text-xs text-center">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}
