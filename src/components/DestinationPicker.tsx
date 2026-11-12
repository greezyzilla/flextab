import { useEffect, useId, useMemo, useRef, useState } from "react"
import type React from "react"
import { commitOnBlur } from "~src/lib/inlineEdit";
import { v7 as uuidv7 } from "uuid"
import { Check, Plus } from "lucide-react"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import type { SavedSpace } from "~src/types"
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"
import { Input, INLINE_CREATE_HINT, inlineEditFrame, SearchField } from "~src/components/ui/input"
import { CategoryIcon, GroupIcon, ProjectIcon, SpaceAvatar, UnsortedIcon } from "~src/components/levelIcons"
import { loadRecentDestinations, type RecentDestination } from "~src/lib/recentDestinations"
import { GroupColorSwatch } from "~src/components/GroupColorMenu"
import { groupColorFill } from "~src/lib/groupColors"
import { DEFAULT_SPACE_NAME, ensureCategoryPath, findUnsorted, isUnsortedGroup, orderedGroups, UNSORTED_NAME } from "~src/lib/defaultPath"

/** A picked destination. With `groupLevel`, it names a group, or a new group to create. */
export type PickerValue = SaveTabsTarget & { groupId?: string; newGroupName?: string }

/**
 * One destination picker for every save/move surface. It mirrors the sidebar
 * tree (same order, same level icons) so the structure reads the same
 * everywhere, and the destination is a single choice instead of three
 * dependent dropdowns. A category is the destination; with `groupLevel` the
 * choice goes one level deeper to a group (used for single-tab captures, so
 * repeated saves land in one group). Missing structure is created right here
 * by naming it — never invented.
 */
export function DestinationPicker({ value, onChange, maxHeightClass = "max-h-60", groupLevel = false, size = "default" }: {
  value: PickerValue
  onChange: (target: PickerValue) => void
  maxHeightClass?: string
  groupLevel?: boolean
  /** "panel": the popup's sizes and a folding tree (TASK-72). Dialogs keep "default". */
  size?: "default" | "panel"
}) {
  const panel = size === "panel"
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  const activeSpaceId = useSavedSpacesStore((s) => s.activeSpaceId)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState<
    | { kind: "project"; spaceId: string }
    | { kind: "category"; spaceId: string; projectId: string }
    | { kind: "group"; spaceId: string; projectId: string; categoryId: string }
    | null
  >(null)
  const groupName = useId()
  // Panel: only the current destination's branch starts open; picking or
  // creating somewhere else opens that branch too.
  const [open, setOpen] = useState<Set<string>>(() => new Set([value.spaceId, value.projectId, value.categoryId]))
  useEffect(() => {
    setOpen((s) => (s.has(value.spaceId) && s.has(value.projectId) && s.has(value.categoryId) ? s : new Set([...s, value.spaceId, value.projectId, value.categoryId])))
  }, [value.spaceId, value.projectId, value.categoryId])

  const q = query.trim().toLowerCase()
  const visible = useMemo(() => filterTree(savedSpaces, q, groupLevel), [savedSpaces, q, groupLevel])

  // Where this device saved last: one click for the common "same place again"
  // case. Entries whose category no longer exists are skipped.
  const [recentTargets, setRecentTargets] = useState<RecentDestination[]>([])
  useEffect(() => {
    let active = true
    void loadRecentDestinations().then((r) => { if (active) setRecentTargets(r) })
    return () => { active = false }
  }, [])
  const recent = recentTargets
    .map((t) => {
      const parts = resolveParts(savedSpaces, t)
      const group = groupLevel && t.groupId ? parts?.category.groups.find((g) => g.id === t.groupId) : undefined
      // In group mode a recent entry is its last group (if it still exists).
      const target: PickerValue = groupLevel && group ? { ...t, groupId: group.id } : { spaceId: t.spaceId, projectId: t.projectId, categoryId: t.categoryId }
      return { target, parts, group }
    })
    .filter((r): r is { target: PickerValue; parts: NonNullable<ReturnType<typeof resolveParts>>; group: typeof r.group } => !!r.parts)

  const createProject = (spaceId: string, name: string) => {
    const store = useSavedSpacesStore.getState()
    const space = store.savedSpaces.find((s) => s.id === spaceId)
    const id = uuidv7()
    store.addSavedProject(spaceId, { id, name, categories: [], order: space?.projects.length ?? 0 })
    // One name per action (TASK-20): no chained category prompt. The new
    // project gets the default category so it is a valid destination at once.
    setCreating(null)
    const path = ensureCategoryPath(spaceId, { projectId: id })
    if (path) onChange(path)
  }

  const createCategory = (spaceId: string, projectId: string, name: string) => {
    const store = useSavedSpacesStore.getState()
    const project = store.savedSpaces.find((s) => s.id === spaceId)?.projects.find((p) => p.id === projectId)
    const id = uuidv7()
    store.addSavedCategory(spaceId, projectId, { id, name, groups: [], order: project?.categories.length ?? 0 })
    setCreating(null)
    onChange({ spaceId, projectId, categoryId: id })
  }

  // No spaces (TASK-37): nothing to find or pick, so no search field and no
  // list box. One line says where the save goes instead.
  if (savedSpaces.length === 0) {
    return <p className="text-xs text-fg-subtle">No spaces yet. Saving creates a space named {DEFAULT_SPACE_NAME}.</p>
  }

  // The default size keeps every class and node it had; `panel` (the popup)
  // swaps sizes for the popup's own (15px rows, 14px boxes, neutral selection)
  // and folds the tree to the branch of the current destination.
  const P = panel ? PANEL : null
  const ic = P ? P.icon : "h-3 w-3 shrink-0"
  const isOpen = (id: string) => !panel || !!q || open.has(id)
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // A panel branch header: chevron, level icon, name. Its guide line marks
  // the level: heavier the higher the level, so a row far down still shows
  // which space / project / category it sits in.
  const branchHeader = (level: 0 | 1 | 2, id: string, icon: React.ReactNode, label: string, labelClass: string) => (
    <button
      type="button"
      aria-expanded={isOpen(id)}
      onClick={() => toggle(id)}
      className={`flex min-h-[38px] w-full min-w-0 items-center pr-3 text-left outline-none transition-colors hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${labelClass}`}
      style={{ paddingLeft: panelIndent(level) }}
    >
      {/* The sidebar tree's own chevron (LeftPanel), at panel size. */}
      <span className="mr-1 flex w-5 shrink-0 justify-center text-fg-subtle" aria-hidden>
        <svg className={`h-[18px] w-[18px] transition-transform ${isOpen(id) ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </span>
      <span className="mr-3 flex shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
  const guide = (level: 0 | 1 | 2, id: string) => panel && isOpen(id) && (
    <span aria-hidden data-guide={level} className="pointer-events-none absolute bottom-1.5 top-8 w-px"
      style={{ left: panelIndent(level) + 10, background: `hsl(var(--ink) / ${GUIDE_WEIGHT[level]})` }} />
  )

  return (
    <div className={`flex flex-col ${P ? "gap-3.5" : "gap-2"} min-w-0`}>
      <SearchField
        type="search"
        size={P ? "panel" : "default"}
        aria-label="Find a destination"
        placeholder="Find a space, project or category…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!q && recent.length > 0 && (
        <div className={`flex flex-col ${P ? "gap-2" : "gap-1"}`}>
          <span className={P ? P.caption : "text-[11px] font-medium text-fg-subtle"}>Recent</span>
          <div className="flex flex-wrap gap-1.5">
            {recent.map(({ target, parts, group }) => {
              const selected =
                value.spaceId === target.spaceId &&
                value.projectId === target.projectId &&
                value.categoryId === target.categoryId &&
                (!groupLevel || value.groupId === target.groupId)
              return (
                <button
                  key={`${target.spaceId}:${target.projectId}:${target.categoryId}`}
                  type="button"
                  aria-pressed={selected}
                  title={describeDestination(savedSpaces, target) ?? undefined}
                  onClick={() => onChange(target)}
                  className={P ? `${P.chip} ${selected ? "bg-ink/[0.12]" : "bg-ink/[0.06] hover:bg-ink/[0.09]"}` : `flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring ${
                    selected ? "border-[var(--accent)] text-fg" : "border-ink/10 text-fg-muted hover:bg-ink/[0.05]"
                  }`}
                  style={selected && !P ? { backgroundColor: "var(--accent-subtle)" } : undefined}
                >
                  {group ? (isUnsortedGroup(group) ? <UnsortedIcon className={P ? P.chipIcon : "h-3 w-3 shrink-0"} /> : <GroupIcon className={P ? P.chipIcon : "h-3 w-3 shrink-0"} />) : <CategoryIcon className={P ? P.chipIcon : "h-3 w-3 shrink-0"} />}
                  <span className="truncate">{group ? group.name : parts.category.name}</span>
                  {group?.color && <GroupColorSwatch fill={groupColorFill(group.color)} className="h-2 w-2" />}
                  <span className={`truncate text-fg-subtle${P ? " text-[13px]" : ""}`}>{group ? parts.category.name : parts.project.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="Destination"
        className={`${maxHeightClass} overflow-y-auto ${P ? "rounded-[14px] bg-ink/[0.04] py-1.5" : "rounded-md border border-ink/10 bg-ink/[0.02] py-1"}`}
      >
        {visible.length === 0 && (
          <div className={`px-3 py-3 ${P ? "text-[13px]" : "text-xs"} text-fg-subtle`}>No match.</div>
        )}
        {visible.map((space) => (
          <div key={space.id} className={P ? "relative py-0.5" : "py-0.5"}>
            {P ? branchHeader(0, space.id, <SpaceAvatar space={space} size={18} active={space.id === activeSpaceId} />, space.name, "text-[13px] leading-[18px] text-fg-subtle") : (
              <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-fg-muted">
                <SpaceAvatar space={space} size={14} active={space.id === activeSpaceId} />
                <span className="truncate">{space.name}</span>
              </div>
            )}
            {guide(0, space.id)}
            {isOpen(space.id) && space.projects.map((project) => (
              <div key={project.id} className={P ? "relative" : undefined}>
                {P ? branchHeader(1, project.id, <ProjectIcon className={ic} />, project.name, "text-[15px] font-medium leading-[22px] text-fg-muted") : (
                  <div className="flex items-center gap-2 pl-5 pr-3 py-1 text-xs text-fg-muted">
                    <ProjectIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                    <span className="truncate font-medium">{project.name}</span>
                  </div>
                )}
                {guide(1, project.id)}
                {isOpen(project.id) && project.categories.map((category) => {
                  const at = { spaceId: space.id, projectId: project.id, categoryId: category.id }
                  const inCategory =
                    value.spaceId === at.spaceId && value.projectId === at.projectId && value.categoryId === at.categoryId
                  if (!groupLevel) {
                    return (
                      <Choice
                        key={category.id}
                        name={groupName}
                        indentClass="pl-10"
                        indent={P ? panelIndent(2) + 24 : undefined}
                        selected={inCategory}
                        icon={<CategoryIcon className={ic} />}
                        label={category.name}
                        onSelect={() => onChange(at)}
                      />
                    )
                  }
                  // Unsorted is the category's default bucket: always offered
                  // first (no groupId = save into Unsorted, created on demand).
                  const unsorted = findUnsorted(category)
                  const groups = orderedGroups(category.groups).filter((g) => !isUnsortedGroup(g))
                  const pendingNew = inCategory && !value.groupId && value.newGroupName
                  const unsortedSelected = inCategory && !value.newGroupName &&
                    (!value.groupId || value.groupId === unsorted?.id)
                  const leaf = P ? panelIndent(3) + 24 : undefined
                  return (
                    <div key={category.id} className={P ? "relative" : undefined}>
                      {P ? branchHeader(2, category.id, <CategoryIcon className={ic} />, category.name, "text-[15px] leading-[22px] text-fg-muted") : (
                        <div className="flex items-center gap-2 pl-10 pr-3 py-1 text-xs text-fg-muted">
                          <CategoryIcon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{category.name}</span>
                        </div>
                      )}
                      {guide(2, category.id)}
                      {isOpen(category.id) && (
                        <>
                          <Choice
                            name={groupName}
                            indentClass="pl-14"
                            indent={leaf}
                            selected={unsortedSelected}
                            icon={<UnsortedIcon className={ic} />}
                            label={UNSORTED_NAME}
                            onSelect={() => onChange(unsorted ? { ...at, groupId: unsorted.id } : at)}
                          />
                          {groups.map((group) => (
                            <Choice
                              key={group.id}
                              name={groupName}
                              indentClass="pl-14"
                              indent={leaf}
                              selected={inCategory && value.groupId === group.id}
                              icon={<GroupIcon className={ic} />}
                              label={group.name}
                              trailing={group.color && <GroupColorSwatch fill={groupColorFill(group.color)} className={P ? "h-2.5 w-2.5" : "h-2 w-2"} />}
                              onSelect={() => onChange({ ...at, groupId: group.id })}
                            />
                          ))}
                          {pendingNew && (
                            <Choice
                              name={groupName}
                              indentClass="pl-14"
                              indent={leaf}
                              selected
                              icon={<GroupIcon className={ic} />}
                              label={`New group: ${value.newGroupName}`}
                              onSelect={() => {}}
                            />
                          )}
                          {!q && (
                            creating?.kind === "group" && creating.categoryId === category.id ? (
                              <NameRow
                                indentClass="pl-14"
                                indent={leaf}
                                icon={<GroupIcon className={`${ic} text-fg-muted`} />}
                                label="New group name"
                                placeholder="Group name"
                                onCommit={(name) => { setCreating(null); onChange({ ...at, newGroupName: name }) }}
                                onCancel={() => setCreating(null)}
                              />
                            ) : (
                              <CreateChoice
                                indentClass="pl-12"
                                indent={leaf}
                                iconClass="h-3 w-3"
                                label="New group"
                                ariaLabel={`New group in ${category.name}`}
                                onClick={() => setCreating({ kind: "group", ...at })}
                              />
                            )
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
                {isOpen(project.id) && !q && (
                  creating?.kind === "category" && creating.projectId === project.id ? (
                    <NameRow
                      indentClass="pl-10"
                      indent={P ? panelIndent(2) + 24 : undefined}
                      icon={<CategoryIcon className={`${ic} text-fg-muted`} />}
                      label="New category name"
                      placeholder="Category name"
                      onCommit={(name) => createCategory(space.id, project.id, name)}
                      onCancel={() => setCreating(null)}
                    />
                  ) : (
                    <CreateChoice
                      indentClass="pl-8"
                      indent={P ? panelIndent(2) + 24 : undefined}
                      iconClass="h-3 w-3"
                      label="New category"
                      ariaLabel={`New category in ${project.name}`}
                      onClick={() => setCreating({ kind: "category", spaceId: space.id, projectId: project.id })}
                    />
                  )
                )}
              </div>
            ))}
            {isOpen(space.id) && !q && (
              creating?.kind === "project" && creating.spaceId === space.id ? (
                <NameRow
                  indentClass="pl-5"
                  indent={P ? panelIndent(1) + 24 : undefined}
                  icon={<ProjectIcon className={P ? `${ic} text-fg-muted` : "h-3.5 w-3.5 shrink-0 text-fg-muted"} />}
                  label="New project name"
                  placeholder="Project name"
                  onCommit={(name) => createProject(space.id, name)}
                  onCancel={() => setCreating(null)}
                />
              ) : (
                <CreateChoice
                  indentClass="pl-3"
                  indent={P ? panelIndent(1) + 24 : undefined}
                  iconClass="h-3.5 w-3.5"
                  label="New project"
                  ariaLabel={`New project in ${space.name}`}
                  onClick={() => setCreating({ kind: "project", spaceId: space.id })}
                />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Panel tree geometry: 12px inset, 16px per level; a header's chevron takes 20px + 4px before its icon. */
const panelIndent = (level: number) => 12 + 16 * level
/** Guide line weight per level (space, project, category): the higher the level, the heavier, so each line names its level. */
const GUIDE_WEIGHT = [0.38, 0.24, 0.14] as const
const PANEL = {
  icon: "h-[18px] w-[18px] shrink-0",
  caption: "text-[13px] leading-[18px] text-fg-subtle",
  chip: "flex h-9 max-w-full items-center gap-2 rounded-[10px] px-2.5 text-[15px] text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
  chipIcon: "h-[18px] w-[18px] shrink-0 text-fg-subtle",
}

/** One selectable row (a radio, visually a list item). */
export function Choice({ name, indentClass, indent, selected, icon, label, trailing, onSelect }: {
  name: string; indentClass: string; selected: boolean; icon: React.ReactNode; label: string
  /** Panel size (TASK-72): the row's left inset in px, 15px text, neutral selection. */
  indent?: number
  /** A mark after the label, e.g. the group's colour (TASK-18). */
  trailing?: React.ReactNode
  onSelect: () => void
}) {
  if (indent !== undefined) {
    return (
      <label
        className={`flex min-h-10 cursor-pointer items-center gap-3 pr-3 text-[15px] leading-[22px] transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring ${
          selected ? "bg-ink/[0.08] text-fg" : "text-fg-muted hover:bg-ink/[0.05]"
        }`}
        style={{ paddingLeft: indent }}
      >
        <input type="radio" name={name} className="sr-only" checked={selected} onChange={onSelect} />
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        {trailing}
        <span className="flex-1" />
        {selected && <Check className="h-[18px] w-[18px] shrink-0 text-fg" aria-hidden />}
      </label>
    )
  }
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 ${indentClass} pr-3 py-1.5 text-xs transition-colors focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring ${
        selected ? "text-fg" : "text-fg-muted hover:bg-ink/[0.05]"
      }`}
      style={selected ? { backgroundColor: "var(--accent-subtle)" } : undefined}
    >
      <input type="radio" name={name} className="sr-only" checked={selected} onChange={onSelect} />
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {trailing}
      <span className="flex-1" />
      {selected && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent-text)" }} aria-hidden />}
    </label>
  )
}

/** Inline name entry; Enter commits, Escape or an empty name cancels. */
/**
 * "Create" slot. It opens a name input instead of selecting, so it must not
 * look like a choice (Law of Similarity) — but without stealing emphasis from
 * the choices (Von Restorff) or using colour as the cue (accent already means
 * "selected" here; WCAG 1.4.1). It differs by shape: a dashed outline, the
 * app's existing "empty slot / add here" language (rail "add space", empty
 * section drop row), muted text and an ellipsis (more input follows). The
 * slot's own padding is subtracted from the indent so its + still sits in the
 * icon column of the items it would create (7px + the 1px border = 8px).
 * With its py-0.5 wrapper it is as tall as a Choice row (2 + 1 + 3 = 6px a
 * side), so the name row that replaces it keeps the list still (TASK-62).
 */
function CreateChoice({ indentClass, indent, iconClass, label, ariaLabel, onClick }: {
  indentClass: string; indent?: number; iconClass: string; label: string; ariaLabel: string; onClick: () => void
}) {
  if (indent !== undefined) {
    // Panel size: the + sits in the icon column of the items it creates
    // (slot inset + 1px border + 7px padding, plus the 16px + centred in 18px).
    return (
      <div className="pr-3 py-0.5" style={{ paddingLeft: indent - 9 }}>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={onClick}
          className="flex min-h-9 w-full items-center gap-3 rounded-[10px] border border-dashed border-ink/15 px-[7px] text-left text-[15px] text-fg-subtle transition-colors hover:border-ink/35 hover:bg-ink/[0.03] hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{label}…</span>
        </button>
      </div>
    )
  }
  return (
    <div className={`${indentClass} pr-3 py-0.5`}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-ink/15 px-[7px] py-[3px] text-left text-xs text-fg-subtle transition-colors hover:border-ink/35 hover:bg-ink/[0.03] hover:text-fg outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Plus className={`${iconClass} shrink-0`} aria-hidden />
        <span className="truncate">{label}…</span>
      </button>
    </div>
  )
}

function NameRow({ indentClass, indent, icon, label, placeholder, onCommit, onCancel }: {
  indentClass: string; indent?: number; icon: React.ReactNode; label: string; placeholder: string
  onCommit: (name: string) => void; onCancel: () => void
}) {
  const [value, setValue] = useState("")
  const done = useRef(false)
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const name = value.trim()
    if (commit && name) onCommit(name); else onCancel()
  }
  const field = (
    <Input
      variant="inline"
      autoFocus
      aria-label={label}
      aria-description={INLINE_CREATE_HINT}
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // Keep Enter/Escape from submitting or closing the surrounding dialog.
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finish(true) }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false) }
      }}
      onBlur={commitOnBlur(() => finish(true))}
      className={`min-w-0 flex-1 font-sans ${indent !== undefined ? "text-[15px]" : "text-xs"}`}
    />
  )
  if (indent !== undefined) {
    return (
      // Panel size: the create slot's own box (inset, py-0.5, 10px radius,
      // min-h-9), so the field takes the slot's place and nothing moves.
      <div className="pr-3 py-0.5" style={{ paddingLeft: indent - 9 }}>
        <div className={`flex min-h-9 items-center gap-3 border border-transparent px-[7px] text-[15px] text-fg ${inlineEditFrame} rounded-[10px]`}>
          {icon}
          {field}
        </div>
      </div>
    )
  }
  return (
    // The Choice row's own box (indent, pr-3, py-1.5, text-xs) drawn as the
    // inline field, so the name sits in the label column (TASK-62).
    <div className={`flex items-center gap-2 ${indentClass} pr-3 py-1.5 text-xs text-fg ${inlineEditFrame}`}>
      {icon}
      {field}
    </div>
  )
}

/** Keep the tree shape; drop branches with no match. Space/project name matches keep their children. */
function filterTree(spaces: SavedSpace[], q: string, matchGroups = false): SavedSpace[] {
  if (!q) return spaces
  const hit = (s: string) => s.toLowerCase().includes(q)
  const out: SavedSpace[] = []
  for (const space of spaces) {
    if (hit(space.name)) { out.push(space); continue }
    const projects = []
    for (const project of space.projects) {
      if (hit(project.name)) { projects.push(project); continue }
      const categories = project.categories.filter((c) => hit(c.name) || (matchGroups && c.groups.some((g) => hit(g.name))))
      if (categories.length) projects.push({ ...project, categories })
    }
    if (projects.length) out.push({ ...space, projects })
  }
  return out
}

function resolveParts(spaces: SavedSpace[], t: SaveTabsTarget) {
  const space = spaces.find((s) => s.id === t.spaceId)
  const project = space?.projects.find((p) => p.id === t.projectId)
  const category = project?.categories.find((c) => c.id === t.categoryId)
  return space && project && category ? { space, project, category } : null
}

/** "Space › Project › Category › Group" for a picked destination, or null when incomplete. */
export function describeDestination(spaces: SavedSpace[], d: PickerValue): string | null {
  const base = describeTarget(spaces, d)
  if (!base) return null
  const group = d.groupId ? resolveParts(spaces, d)?.category.groups.find((g) => g.id === d.groupId) : undefined
  if (group) return `${base} › ${group.name}`
  return d.newGroupName ? `${base} › ${d.newGroupName} (new)` : base
}

/** "Space › Project › Category" for a target, or null when incomplete. */
export function describeTarget(spaces: SavedSpace[], t: SaveTabsTarget): string | null {
  const parts = resolveParts(spaces, t)
  return parts ? `${parts.space.name} › ${parts.project.name} › ${parts.category.name}` : null
}
