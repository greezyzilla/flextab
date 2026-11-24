import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { Icon } from "~src/components/ui/icon"
import { Tag } from "~src/components/ui/tag";
import { shortcutLabel } from "~src/lib/platform";
import { openOrFocus } from "~src/services/openTab";
import { revealInWorkspace } from "~src/services/reveal";
import { searchAll, type OpenTabHit, type OpenTabInput, type PlaceHit, type SavedTabHit } from "~src/services/searchIndex";
import { searchActions, type ActionHit } from "~src/services/paletteActions";
import { useSettingsStore } from "~src/store/useSettingsStore";
import { Monitor, Moon, Sun, X } from "lucide-react";
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore";
import { SearchField } from "~src/components/ui/input";
import { IconButton } from "~src/components/ui/button";
import { Kbd } from "~src/components/ui/kbd";
import { CategoryIcon, GroupIcon, ProjectIcon, SpaceAvatar } from "~src/components/levelIcons";
import { cn } from "~src/lib/utils";
import { isInsideModal } from "~src/components/ui/modal";
import { FaviconImg } from "./FaviconImg";

/** The header search field's placeholder; the Appearance preview shows the same field. */
export const searchPlaceholder = () => `Search tabs, groups and spaces… (${shortcutLabel("Mod+K")})`;

type Section = "open" | "saved" | "places" | "actions";
type Hit = OpenTabHit | SavedTabHit | PlaceHit | ActionHit;
/** One row of the list: a result, or a section's "Show all". */
type Item = { key: string; hit: Hit } | { key: string; more: Section; hidden: number };

// How many each section shows before "Show N more": enough to choose from at
// a glance (Hick), few enough that Places stays in view, never cut silently.
const LIMIT: Record<Section, number> = { open: 3, saved: 5, places: 4, actions: 3 };
const TITLE: Record<Section, string> = { open: "Open tabs", saved: "Saved tabs", places: "Places", actions: "Actions" };
const NOUN: Record<Section, string> = { open: "open tabs", saved: "saved tabs", places: "places", actions: "actions" };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
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
  if (hit.kind === "action") return <><Kbd shortcut="Enter" /> apply</>;
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
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A modal owns the keyboard: no search behind it (TASK-47).
      if (isInsideModal(e.target)) return;
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

  const results = useMemo(
    () => ({ ...searchAll(query, savedSpaces, openTabs), actions: searchActions(query, theme) }),
    [query, savedSpaces, openTabs, theme],
  );
  useEffect(() => { setExpanded(new Set()); }, [query]);

  const sections = useMemo(() => {
    const out: { section: Section; items: Item[] }[] = [];
    for (const section of ["open", "saved", "places", "actions"] as Section[]) {
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
  const total = results.open.length + results.saved.length + results.places.length + results.actions.length;

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
    } else if (hit.kind === "action") {
      setTheme(hit.theme);
    } else if (hit.kind === "saved") {
      if (reveal) revealInWorkspace({ spaceId: hit.spaceId, projectId: hit.projectId, categoryId: hit.categoryId, flash: { kind: "tab", id: hit.tab.id } });
      // Go to it if already open (TASK-4); remember where it came from (TASK-72).
      else void openOrFocus(hit.tab.url, { spaceId: hit.spaceId, projectId: hit.projectId, categoryId: hit.categoryId, groupId: hit.groupId, tabId: hit.tab.id });
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
      className: cn("flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left", selected ? "bg-ink/10" : "hover:bg-ink/5"),
    };
    if ("more" in item) {
      return <div key={item.key} {...common}><span className="pl-7 text-fg-muted text-xs">Show {item.hidden} more {NOUN[item.more]}</span></div>;
    }
    const { hit } = item;
    let icon: ReactNode, title: string, detail: string, aside: ReactNode = null;
    if (hit.kind === "open") {
      icon = <FaviconImg src={hit.favicon} alt="" className="w-4 h-4 shrink-0" />;
      title = hit.title; detail = host(hit.url);
      aside = hit.windowLabel && <span className="text-fg-subtle text-caption">{hit.windowLabel}</span>;
    } else if (hit.kind === "saved") {
      icon = <FaviconImg src={hit.tab.favicon} alt="" className="w-4 h-4 shrink-0" />;
      title = hit.tab.title || hit.tab.url; detail = `${host(hit.tab.url)} · ${hit.path.join(" › ")}`;
      aside = hit.isOpen && <Tag>Open</Tag>;
    } else if (hit.kind === "action") {
      icon = <Icon icon={THEME_ICON[hit.theme]} size="md" className="text-fg-subtle" />;
      title = hit.title; detail = "";
      aside = hit.current && <Tag>Current</Tag>;
    } else {
      const space = savedSpaces.find((s) => s.id === hit.spaceId);
      icon = hit.level === "space" ? <SpaceAvatar space={space} size={16} />
        : hit.level === "project" ? <ProjectIcon size="md" className="text-fg-subtle" />
        : hit.level === "category" ? <CategoryIcon size="md" className="text-fg-subtle" />
        : <GroupIcon size="md" className="text-fg-subtle" />;
      title = hit.name; detail = hit.path.join(" › ");
      aside = <span className="text-fg-subtle text-caption">{LEVEL[hit.level]}</span>;
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
      <SearchField
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
        placeholder={searchPlaceholder()}
        trailing={query && (
          <IconButton type="button" variant="subtle" size="sm" className="shrink-0" onClick={() => setQuery("")} aria-label="Clear search">
            <Icon icon={X} size="sm" />
          </IconButton>
        )}
      />

      {showDropdown && (
        // Clicks keep focus in the input, so the list never closes under them.
        <div className="absolute top-full left-0 right-0 z-50 mt-1 flex max-h-[min(70vh,36rem)] flex-col overflow-hidden rounded-md border border-ink/10 bg-black-800 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
          <div ref={listRef} id="search-listbox" role="listbox" aria-label="Search results" className="flex-1 overflow-y-auto py-1">
            {sections.map(({ section, items }) => (
              <div key={section} role="group" aria-labelledby={`search-group-${section}`}>
                <div className="flex items-baseline justify-between px-3 pt-2 pb-1">
                  <span id={`search-group-${section}`} className="text-fg-subtle text-caption font-medium uppercase tracking-wider">{TITLE[section]}</span>
                  <span className="text-fg-subtle text-caption tabular-nums">{results[section].length}</span>
                </div>
                {items.map(row)}
              </div>
            ))}
            {total === 0 && <div className="px-3 py-4 text-center text-fg-subtle text-xs">No results for “{query.trim()}”</div>}
          </div>
          {total > 0 && (
            <div className="flex shrink-0 items-center gap-1 border-t border-ink/10 px-3 py-1.5 text-fg-subtle text-caption" aria-hidden>
              {hintFor(active)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
