import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { shortcutLabel } from "~src/lib/platform";
import { openOrFocus } from "~src/services/openTab";
import { revealInWorkspace } from "~src/services/reveal";
import { searchAll, type OpenTabHit, type OpenTabInput, type PlaceHit, type SavedTabHit } from "~src/services/searchIndex";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { Input } from "~src/components/ui/input";
import { Button } from "~src/components/ui/button";
import { Kbd } from "~src/components/ui/kbd";
import { CategoryIcon, GroupIcon, ProjectIcon, SpaceAvatar } from "~src/components/levelIcons";
import { cn } from "~src/lib/utils";
import { FaviconImg } from "./FaviconImg";

type Section = "open" | "saved" | "places";
type Hit = OpenTabHit | SavedTabHit | PlaceHit;
/** One row of the list: a result, or a section's "Show all". */
type Item = { key: string; hit: Hit } | { key: string; more: Section; hidden: number };

// How many each section shows before "Show N more": enough to choose from at
// a glance (Hick), few enough that Places stays in view, never cut silently.
const LIMIT: Record<Section, number> = { open: 3, saved: 5, places: 4 };
const TITLE: Record<Section, string> = { open: "Open tabs", saved: "Saved tabs", places: "Places" };
const NOUN: Record<Section, string> = { open: "open tabs", saved: "saved tabs", places: "places" };
const LEVEL: Record<PlaceHit["level"], string> = { space: "Space", project: "Project", category: "Category", group: "Group" };

const host = (url: string) => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; } };
const optionId = (key: string) => `search-option-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

/** What Enter (and ⇧Enter) does on the active row, shown under the list. */
function hintFor(item: Item | undefined): ReactNode {
  if (!item) return <><Kbd shortcut="↑" /><Kbd shortcut="↓" /> to move</>;
  if ("more" in item) return <><Kbd shortcut="Enter" /> show all</>;
  const { hit } = item;
  if (hit.kind === "open") return <><Kbd shortcut="Enter" /> switch to tab</>;
  if (hit.kind === "place") return <><Kbd shortcut="Enter" /> go there</>;
  return (
    <>
      <Kbd shortcut="Enter" /> {hit.isOpen ? "switch to tab" : "open"}
      <span className="mx-1.5 text-fg-disabled">·</span>
      <Kbd shortcut="Shift+Enter" /> show in FlexTab
    </>
  );
}

/**
 * ⌘K / "/" (TASK-14): one place to find open tabs, saved tabs and the spaces,
 * projects, categories and groups they live in. Enter goes to the page (or the
 * place); ⇧Enter shows a saved tab where it lives in the workspace.
 * ARIA combobox: focus stays in the input, the list follows aria-activedescendant.
 */
export function SearchBar() {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<Section>>(new Set());
  const [openTabs, setOpenTabs] = useState<OpenTabInput[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Open tabs as they are when the search opens.
  const loadOpenTabs = () => {
    try {
      chrome.tabs.query({}).then((tabs) => setOpenTabs(tabs.map((t) => ({ id: t.id, windowId: t.windowId, title: t.title, url: t.url, favIconUrl: t.favIconUrl })))).catch(() => setOpenTabs([]));
    } catch (_) { /* no extension context */ }
  };

  const results = useMemo(() => searchAll(query, savedSpaces, openTabs), [query, savedSpaces, openTabs]);
  useEffect(() => { setExpanded(new Set()); }, [query]);

  const sections = useMemo(() => {
    const out: { section: Section; items: Item[] }[] = [];
    for (const section of ["open", "saved", "places"] as Section[]) {
      const hits: Hit[] = results[section];
      if (!hits.length) continue;
      const shown = expanded.has(section) ? hits : hits.slice(0, LIMIT[section]);
      const items: Item[] = shown.map((hit) => ({ key: hit.key, hit }));
      if (shown.length < hits.length) items.push({ key: `more:${section}`, more: section, hidden: hits.length - shown.length });
      out.push({ section, items });
    }
    return out;
  }, [results, expanded]);
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const total = results.open.length + results.saved.length + results.places.length;

  // The first row is active as soon as there are results, so Enter just works.
  useEffect(() => {
    if (!items.some((i) => i.key === activeKey)) setActiveKey(items[0]?.key ?? null);
  }, [items, activeKey]);

  useEffect(() => {
    if (!activeKey || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`#${optionId(activeKey)}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeKey]);

  const close = () => { setQuery(""); inputRef.current?.blur(); };

  const choose = (item: Item, reveal = false) => {
    if ("more" in item) {
      setExpanded((prev) => new Set(prev).add(item.more));
      return;
    }
    const { hit } = item;
    if (hit.kind === "open") {
      void chrome.tabs.update(hit.tabId, { active: true });
      void chrome.windows.update(hit.windowId, { focused: true });
    } else if (hit.kind === "saved") {
      if (reveal) revealInWorkspace({ spaceId: hit.spaceId, projectId: hit.projectId, categoryId: hit.categoryId, flash: { kind: "tab", id: hit.tab.id } });
      else void openOrFocus(hit.tab.url); // go to it if already open (TASK-4)
    } else {
      revealInWorkspace({
        spaceId: hit.spaceId, projectId: hit.projectId, categoryId: hit.categoryId,
        flash: hit.level === "group" ? { kind: "group", id: hit.id } : undefined,
      });
    }
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!items.length) return;
    const at = items.findIndex((i) => i.key === activeKey);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveKey(items[(at + 1) % items.length].key);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveKey(items[at <= 0 ? items.length - 1 : at - 1].key);
    } else if (e.key === 'Enter' && at >= 0) {
      e.preventDefault();
      choose(items[at], e.shiftKey);
    }
  };

  const showDropdown = isFocused && query.trim().length > 0;
  const active = items.find((i) => i.key === activeKey);

  const row = (item: Item) => {
    const selected = item.key === activeKey;
    const common = {
      id: optionId(item.key),
      role: "option" as const,
      "aria-selected": selected,
      // Only a moving pointer picks a row: a list opening under a resting
      // pointer must not steal the row Enter acts on.
      onMouseMove: () => { if (activeKey !== item.key) setActiveKey(item.key); },
      onClick: (e: React.MouseEvent) => choose(item, e.shiftKey),
      className: cn("flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left", selected ? "bg-white/10" : "hover:bg-white/5"),
    };
    if ("more" in item) {
      return <div key={item.key} {...common}><span className="pl-7 text-fg-muted text-xs">Show {item.hidden} more {NOUN[item.more]}</span></div>;
    }
    const { hit } = item;
    let icon: ReactNode, title: string, detail: string, aside: ReactNode = null;
    if (hit.kind === "open") {
      icon = <FaviconImg src={hit.favicon} alt="" className="w-4 h-4 shrink-0" />;
      title = hit.title; detail = host(hit.url);
      aside = hit.windowLabel && <span className="text-fg-subtle text-[11px]">{hit.windowLabel}</span>;
    } else if (hit.kind === "saved") {
      icon = <FaviconImg src={hit.tab.favicon} alt="" className="w-4 h-4 shrink-0" />;
      title = hit.tab.title || hit.tab.url; detail = `${host(hit.tab.url)} · ${hit.path.join(" › ")}`;
      aside = hit.isOpen && <span className="rounded border border-white/10 px-1.5 text-fg-muted text-[11px] leading-[18px]">Open</span>;
    } else {
      const space = savedSpaces.find((s) => s.id === hit.spaceId);
      icon = hit.level === "space" ? <SpaceAvatar space={space} size={16} />
        : hit.level === "project" ? <ProjectIcon className="h-4 w-4 shrink-0 text-fg-subtle" />
        : hit.level === "category" ? <CategoryIcon className="h-4 w-4 shrink-0 text-fg-subtle" />
        : <GroupIcon className="h-4 w-4 shrink-0 text-fg-subtle" />;
      title = hit.name; detail = hit.path.join(" › ");
      aside = <span className="text-fg-subtle text-[11px]">{LEVEL[hit.level]}</span>;
    }
    return (
      <div key={item.key} {...common}>
        {icon}
        <div className="min-w-0 flex-1">
          <div className="truncate text-fg text-xs">{title}</div>
          {detail && <div className="truncate text-fg-subtle text-xs">{detail}</div>}
        </div>
        {aside && <span className="shrink-0">{aside}</span>}
      </div>
    );
  };

  return (
    <div className="relative flex-1 max-w-lg">
      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 transition-colors focus-within:border-white/30">
        <svg className="w-4 h-4 text-fg-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <Input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search tabs, groups and spaces"
          aria-expanded={showDropdown}
          aria-controls="search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && activeKey ? optionId(activeKey) : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { setIsFocused(true); loadOpenTabs(); }}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          data-search-input
          placeholder={`Search tabs, groups and spaces… (${shortcutLabel("Mod+K")})`}
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
        // Clicks keep focus in the input, so the list never closes under them.
        <div className="absolute top-full left-0 right-0 z-50 mt-1 flex max-h-[min(70vh,36rem)] flex-col overflow-hidden rounded-md border border-white/10 bg-black-800 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
          <div ref={listRef} id="search-listbox" role="listbox" aria-label="Search results" className="flex-1 overflow-y-auto py-1">
            {sections.map(({ section, items }) => (
              <div key={section} role="group" aria-labelledby={`search-group-${section}`}>
                <div className="flex items-baseline justify-between px-3 pt-2 pb-1">
                  <span id={`search-group-${section}`} className="text-fg-subtle text-[11px] font-medium uppercase tracking-wider">{TITLE[section]}</span>
                  <span className="text-fg-subtle text-[11px] tabular-nums">{results[section].length}</span>
                </div>
                {items.map(row)}
              </div>
            ))}
            {total === 0 && <div className="px-3 py-4 text-center text-fg-subtle text-xs">No results for “{query.trim()}”</div>}
          </div>
          {total > 0 && (
            <div className="flex shrink-0 items-center gap-1 border-t border-white/10 px-3 py-1.5 text-fg-subtle text-[11px]" aria-hidden>
              {hintFor(active)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
