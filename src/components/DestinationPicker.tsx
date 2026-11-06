import { useEffect, useId, useMemo, useRef, useState } from "react"
import { v7 as uuidv7 } from "uuid"
import { Check, Plus } from "lucide-react"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import type { SavedSpace } from "~src/types"
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"
import { Input } from "~src/components/ui/input"
import { CategoryIcon, GroupIcon, ProjectIcon, SpaceAvatar, UnsortedIcon } from "~src/components/levelIcons"
import { loadRecentDestinations, type RecentDestination } from "~src/lib/recentDestinations"
import { ensureCategoryPath, findUnsorted, isUnsortedGroup, orderedGroups, UNSORTED_NAME } from "~src/lib/defaultPath"

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
export function DestinationPicker({ value, onChange, maxHeightClass = "max-h-60", groupLevel = false }: {
  value: PickerValue
  onChange: (target: PickerValue) => void
  maxHeightClass?: string
  groupLevel?: boolean
}) {
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

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <Input
        type="search"
        aria-label="Find a destination"
        placeholder="Find a space, project or category…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
      />
      {!q && recent.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-white/55">Recent</span>
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
                  className={`flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring ${
                    selected ? "border-[var(--accent)] text-white/95" : "border-white/10 text-white/75 hover:bg-white/[0.05]"
                  }`}
                  style={selected ? { backgroundColor: "var(--accent-subtle)" } : undefined}
                >
                  {group ? (isUnsortedGroup(group) ? <UnsortedIcon className="h-3 w-3 shrink-0" /> : <GroupIcon className="h-3 w-3 shrink-0" />) : <CategoryIcon className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{group ? group.name : parts.category.name}</span>
                  <span className="truncate text-white/50">{group ? parts.category.name : parts.project.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="Destination"
        className={`${maxHeightClass} overflow-y-auto rounded-md border border-white/10 bg-white/[0.02] py-1`}
      >
        {visible.length === 0 && (
          <div className="px-3 py-3 text-xs text-white/55">No match.</div>
        )}
        {visible.map((space) => (
          <div key={space.id} className="py-0.5">
            <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-white/60">
              <SpaceAvatar space={space} size={14} active={space.id === activeSpaceId} />
              <span className="truncate">{space.name}</span>
            </div>
            {space.projects.map((project) => (
              <div key={project.id}>
                <div className="flex items-center gap-2 pl-5 pr-3 py-1 text-xs text-white/75">
                  <ProjectIcon className="h-3.5 w-3.5 shrink-0 text-white/55" />
                  <span className="truncate font-medium">{project.name}</span>
                </div>
                {project.categories.map((category) => {
                  const at = { spaceId: space.id, projectId: project.id, categoryId: category.id }
                  const inCategory =
                    value.spaceId === at.spaceId && value.projectId === at.projectId && value.categoryId === at.categoryId
                  if (!groupLevel) {
                    return (
                      <Choice
                        key={category.id}
                        name={groupName}
                        indentClass="pl-10"
                        selected={inCategory}
                        icon={<CategoryIcon className="h-3 w-3 shrink-0" />}
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
                  return (
                    <div key={category.id}>
                      <div className="flex items-center gap-2 pl-10 pr-3 py-1 text-xs text-white/70">
                        <CategoryIcon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{category.name}</span>
                      </div>
                      <Choice
                        name={groupName}
                        indentClass="pl-14"
                        selected={unsortedSelected}
                        icon={<UnsortedIcon className="h-3 w-3 shrink-0" />}
                        label={UNSORTED_NAME}
                        onSelect={() => onChange(unsorted ? { ...at, groupId: unsorted.id } : at)}
                      />
                      {groups.map((group) => (
                        <Choice
                          key={group.id}
                          name={groupName}
                          indentClass="pl-14"
                          selected={inCategory && value.groupId === group.id}
                          icon={<GroupIcon className="h-3 w-3 shrink-0" />}
                          label={group.name}
                          onSelect={() => onChange({ ...at, groupId: group.id })}
                        />
                      ))}
                      {pendingNew && (
                        <Choice
                          name={groupName}
                          indentClass="pl-14"
                          selected
                          icon={<GroupIcon className="h-3 w-3 shrink-0" />}
                          label={`New group: ${value.newGroupName}`}
                          onSelect={() => {}}
                        />
                      )}
                      {!q && (
                        creating?.kind === "group" && creating.categoryId === category.id ? (
                          <NameRow
                            indentClass="pl-14"
                            icon={<GroupIcon className="h-3 w-3 shrink-0 text-white/70" />}
                            label="New group name"
                            placeholder="Group name"
                            onCommit={(name) => { setCreating(null); onChange({ ...at, newGroupName: name }) }}
                            onCancel={() => setCreating(null)}
                          />
                        ) : (
                          <CreateChoice
                            indentClass="pl-12"
                            iconClass="h-3 w-3"
                            label="New group"
                            ariaLabel={`New group in ${category.name}`}
                            onClick={() => setCreating({ kind: "group", ...at })}
                          />
                        )
                      )}
                    </div>
                  )
                })}
                {!q && (
                  creating?.kind === "category" && creating.projectId === project.id ? (
                    <NameRow
                      indentClass="pl-10"
                      icon={<CategoryIcon className="h-3 w-3 shrink-0 text-white/70" />}
                      label="New category name"
                      placeholder="Category name"
                      onCommit={(name) => createCategory(space.id, project.id, name)}
                      onCancel={() => setCreating(null)}
                    />
                  ) : (
                    <CreateChoice
                      indentClass="pl-8"
                      iconClass="h-3 w-3"
                      label="New category"
                      ariaLabel={`New category in ${project.name}`}
                      onClick={() => setCreating({ kind: "category", spaceId: space.id, projectId: project.id })}
                    />
                  )
                )}
              </div>
            ))}
            {!q && (
              creating?.kind === "project" && creating.spaceId === space.id ? (
                <NameRow
                  indentClass="pl-5"
                  icon={<ProjectIcon className="h-3.5 w-3.5 shrink-0 text-white/70" />}
                  label="New project name"
                  placeholder="Project name"
                  onCommit={(name) => createProject(space.id, name)}
                  onCancel={() => setCreating(null)}
                />
              ) : (
                <CreateChoice
                  indentClass="pl-3"
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

/** One selectable row (a radio, visually a list item). */
function Choice({ name, indentClass, selected, icon, label, onSelect }: {
  name: string; indentClass: string; selected: boolean; icon: React.ReactNode; label: string; onSelect: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 ${indentClass} pr-3 py-1.5 text-xs transition-colors focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring ${
        selected ? "text-white/95" : "text-white/70 hover:bg-white/[0.05]"
      }`}
      style={selected ? { backgroundColor: "var(--accent-subtle)" } : undefined}
    >
      <input type="radio" name={name} className="sr-only" checked={selected} onChange={onSelect} />
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} aria-hidden />}
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
 */
function CreateChoice({ indentClass, iconClass, label, ariaLabel, onClick }: {
  indentClass: string; iconClass: string; label: string; ariaLabel: string; onClick: () => void
}) {
  return (
    <div className={`${indentClass} pr-3 py-0.5`}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-white/15 px-[7px] py-1 text-left text-xs text-white/55 transition-colors hover:border-white/35 hover:bg-white/[0.03] hover:text-white/85 outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Plus className={`${iconClass} shrink-0`} aria-hidden />
        <span className="truncate">{label}…</span>
      </button>
    </div>
  )
}

function NameRow({ indentClass, icon, label, placeholder, onCommit, onCancel }: {
  indentClass: string; icon: React.ReactNode; label: string; placeholder: string
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
  return (
    <div className={`flex items-center gap-2 ${indentClass} pr-3 py-1`}>
      {icon}
      <Input
        variant="inline"
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Keep Enter/Escape from submitting or closing the surrounding dialog.
          if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finish(true) }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false) }
        }}
        onBlur={() => finish(true)}
        className="min-w-0 flex-1 text-xs"
      />
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
