import { useState, useMemo, useRef, useEffect } from "react";
import { shortcutLabel } from "~src/lib/platform";
import { openOrFocus } from "~src/services/openTab";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { Input } from "~src/components/ui/input";
import { Button } from "~src/components/ui/button";
import { FaviconImg } from "./FaviconImg";

interface SearchResult {
  title: string;
  url: string;
  favicon: string;
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

    // Search saved tabs only
    for (const space of savedSpaces) {
      for (const project of space.projects) {
        for (const category of project.categories) {
          for (const group of category.groups) {
            for (const tab of group.tabs) {
              if (tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q)) {
                matches.push({
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

    return matches.slice(0, 20);
  }, [query, savedSpaces]);

  const handleResultClick = (result: SearchResult) => {
    // Go to the tab if it is already open, else open it (TASK-4).
    void openOrFocus(result.url);
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
      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 transition-colors focus-within:border-white/30">
        <svg className="w-4 h-4 text-fg-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          data-search-input
          placeholder={`Search saved tabs… (${shortcutLabel("Mod+K")})`}
          className="h-auto flex-1 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-0"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setQuery("")}
            className="h-6 w-6 shrink-0 p-0 text-fg-subtle hover:text-fg-muted"
            aria-label="Clear search"
          >
            ✕
          </Button>
        )}
      </div>

      {showDropdown && (
        <div ref={listRef} className="absolute top-full left-0 right-0 mt-1 bg-black-800 border border-white/10 rounded-md shadow-lg max-h-80 overflow-y-auto z-50">
          {results.length > 0 ? (
            results.map((result, i) => (
              <button
                key={`${result.url}-${i}`}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${i === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <FaviconImg src={result.favicon} alt={result.title} className="w-4 h-4 shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-fg text-xs truncate">{result.title}</div>
                  <div className="text-fg-subtle text-xs truncate">{result.url}</div>
                  {result.breadcrumb && (
                    <div className="text-fg-subtle text-xs truncate">{result.breadcrumb}</div>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-fg-subtle text-xs text-center">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}
