import { useState, type CSSProperties } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { BrandMark } from "~src/components/ui/brand-mark"
import { Skeleton, SkeletonRegion } from "~src/components/ui/skeleton"
import { ActionSlot } from "~src/components/ui/row-actions"
import { GRID_MIN_CELL, GROUP_INLINE } from "~src/components/TabGroup"
import { LEFT_INLINE_QUERY, RIGHT_INLINE_QUERY, useShellLayout } from "~src/hooks/useMediaQuery"
import { fitToScreen, readStoredShellShape, type ShellShape } from "~src/lib/shellShape"
import { PANEL_HEADER, PANEL_LIST } from "./panelChrome"

/**
 * Drawn before anything has been seen (first run, storage blocked): two spaces, an open project with
 * two categories, a closed one, two groups and one window.
 */
const SAMPLE: ShellShape = {
  spaces: 2,
  projects: [{ open: true, categories: [0, 0] }, { open: false, categories: [] }],
  active: null,
  content: { layout: "list", gridColumns: 2, projectHasGroups: true, sections: [{ unsorted: null, groups: [3, 2] }] },
  windows: [2],
}

/** Sample widths for the bars that stand in for names, picked by position. */
const W = [64, 52, 72, 60, 80, 48]
const w = (i: number) => W[i % W.length]

/**
 * The footer's version line ("FlexTab v0.1.0" in the caption size) and its Shortcuts button, as
 * wide as in the loaded app (measured, default font, TASK-109), so neither moves when it arrives.
 */
const VERSION_W = 72
const SHORTCUTS_W = 86

/**
 * The new tab while the workspace loads (TASK-106): the app shell itself, at its real widths and
 * header lines, drawn in the shape the workspace had when it was last seen (lib/shellShape.ts): as
 * many spaces, projects, categories, Unsorted trays, groups, tabs and windows, in list or grid, with
 * the selected category lit. The spacing comes from the same density variables as the real rows, so
 * the workspace lands where its skeleton was. Everything paints in the first frame.
 */
export function ShellSkeleton() {
  const { leftInline, rightInline } = useShellLayout()
  const [shape] = useState(() => readStoredShellShape() ?? SAMPLE)
  return <ShellSkeletonView shape={shape} leftInline={leftInline} rightInline={rightInline} />
}

/**
 * The height the skeleton is cut at: the screen's (at least the window's), so the copy the boot
 * script shows (storeShellSkeletonMarkup) and the skeleton React draws on the same screen are the
 * same markup, whatever the window's height.
 */
export const skeletonHeight = () => Math.max(window.innerHeight, window.screen?.availHeight ?? 0)

/** localStorage copy of the skeleton's markup for boot/shell.js (TASK-107). */
export const SHELL_SKELETON_STORAGE_KEY = "flextab-shell-skeleton"

/**
 * Renders the skeleton for the stored shape and this window's layout, off screen, and keeps its
 * markup for the next new tab: boot/shell.js puts it in the page before the first paint, so the
 * shell is there while the app's script loads, and React then draws the very same markup.
 */
export function storeShellSkeletonMarkup() {
  const shape = readStoredShellShape()
  if (!shape) return
  const leftInline = window.matchMedia(LEFT_INLINE_QUERY).matches
  const rightInline = window.matchMedia(RIGHT_INLINE_QUERY).matches
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<ShellSkeletonView shape={shape} leftInline={leftInline} rightInline={rightInline} />))
    localStorage.setItem(SHELL_SKELETON_STORAGE_KEY, JSON.stringify({ html: host.innerHTML, leftInline, rightInline, height: skeletonHeight() }))
  } catch {
    // Storage blocked or full: the next new tab shows the themed surface until its script runs.
  } finally {
    root.unmount()
  }
}

/** The skeleton for a shape and layout; pure, so the boot copy and React's render are the same markup. */
export function ShellSkeletonView({ shape: stored, leftInline, rightInline }: { shape: ShellShape; leftInline: boolean; rightInline: boolean }) {
  const shape = fitToScreen(stored, skeletonHeight())
  const content = shape.content
  return (
    <SkeletonRegion label="Loading your workspace">
      <div className="flex h-screen w-screen overflow-hidden bg-black-900">
      <div className="flex h-full w-16 flex-col border-r border-line">
        <div className="flex h-16 w-full shrink-0 items-center justify-center border-b border-line">
          <BrandMark />
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-hidden pb-4 pt-2">
          {/* The spaces, then the Add space slot. */}
          {Array.from({ length: shape.spaces }, (_, i) => <Skeleton key={i} width={40} height={40} round="full" />)}
          <Skeleton width={40} height={40} round="full" tone="faint" />
        </div>
        {/* Settings and the account, at the rail's foot as in ProfilePanel. */}
        <div className="flex flex-col items-center gap-2 py-4">
          <Skeleton width={40} height={40} round="full" tone="faint" />
          <Skeleton width={40} height={40} round="full" tone="faint" />
        </div>
      </div>

      {leftInline && (
        <div className="flex h-full w-64 flex-col">
          <div className={PANEL_HEADER}>
            <Skeleton line={32} width={96} height={18} />
            {/* The space's actions (⋯). */}
            <Skeleton width={26} height={26} round="md" tone="faint" />
          </div>
          <div className={`${PANEL_LIST} overflow-hidden`}>
            {shape.projects.map((p, pi) => (
              <div key={pi} className="mb-1">
                <ProjectRow width={w(pi)} />
                {p.open && (
                  <div className="mt-0.5">
                    {p.categories.map((groups, ci) => (
                      <CategoryRow key={ci} width={w(pi + ci + 2)} groups={groups} active={shape.active?.[0] === pi && shape.active?.[1] === ci} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* New project…, under the tree. */}
            <div className="mx-2 pl-1 pr-2"><Skeleton width="100%" height={32} round="md" tone="faint" /></div>
          </div>
          {/* The panel footer (PanelFooter): the version on the left (a text line), Shortcuts on the right. */}
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
            <Skeleton line={16} width={VERSION_W} height={8} tone="faint" />
            <Skeleton width={SHORTCUTS_W} height={28} round="md" tone="faint" />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col border-x border-line">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
          <div className="max-w-lg flex-1">
            <Skeleton width="100%" height={36} round="md" tone="faint" />
          </div>
          {/* The sync status (Sign in to sync), at the header's right. */}
          <span className="ml-auto"><Skeleton width={127} height={36} round="md" tone="faint" /></span>
        </div>
        {shape.spaces > 0 && (
          // The location: space › project › category, each with its own mark; the view toggle and Save all tabs.
          <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line px-6">
            <Skeleton width={16} height={16} round="full" />
            <Skeleton line={20} width={36} height={10} tone="faint" />
            {content && <>
              <Skeleton width={5} height={8} tone="faint" />
              <Skeleton width={14} height={14} />
              <Skeleton line={20} width={48} height={10} tone="faint" />
              <Skeleton width={5} height={8} tone="faint" />
              <Skeleton width={14} height={14} />
              <Skeleton line={20} width={60} height={10} tone="faint" />
              <span className="ml-auto flex items-center gap-2">
                {content.projectHasGroups && <Skeleton width={60} height={32} round="md" tone="faint" />}
                <Skeleton width={98} height={32} round="md" tone="faint" />
              </span>
            </>}
          </div>
        )}
        {content && (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {content.sections.map((section, i) => (
              <div key={i} className={i === 0 ? undefined : "-mt-px border-t border-ink/[0.12]"}>
                <CategoryHeader groups={section.groups.length} unsorted={section.unsorted !== null} />
                {section.unsorted !== null && <GroupBlock tabs={section.unsorted} unsorted layout={content.layout} gridColumns={content.gridColumns} />}
                {section.groups.map((tabs, gi) => (
                  <GroupBlock key={gi} tabs={tabs} nameWidth={[88, 72, 104, 64][gi % 4]} layout={content.layout} gridColumns={content.gridColumns} />
                ))}
                {section.unsorted === null && section.groups.length === 0 && (
                  <div className="px-6" style={{ paddingTop: "var(--density-p-section)" }}>
                    {shape.anyTabs === false ? <FirstRunDrop /> : <EmptyDrop />}
                  </div>
                )}
                {i < content.sections.length - 1 && <div aria-hidden style={{ height: "calc(var(--density-p-section) * 2)" }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {rightInline && (
        <div className="flex h-full w-80 flex-col">
          <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
            <Skeleton line={20} width={104} height={12} />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {shape.windows.map((tabs, i) => (
              <div key={i} className={i > 0 ? "border-t border-line" : undefined}>
                {/* The window row: its collapse chevron, name and count, Save window as a group on the right. */}
                <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line pl-4 pr-6">
                  <Skeleton width={26} height={26} round="md" tone="faint" />
                  <Skeleton line={20} width={100} height={10} tone="faint" />
                  <span className="ml-auto"><Skeleton width={26} height={26} round="md" tone="faint" /></span>
                </div>
                {tabs > 0 && (
                  <div className="flex flex-col gap-0.5 p-3">
                    {Array.from({ length: tabs }, (_, t) => <OpenTabRow key={t} i={t} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </SkeletonRegion>
  )
}

/** A project row of the sidebar tree: its chevron column, folder mark, name and its two actions, 32px tall. */
function ProjectRow({ width }: { width: number }) {
  return (
    <div className="mx-2 flex h-8 items-center gap-1 pl-1 pr-1">
      <span className="flex w-5 justify-center"><Skeleton width={8} height={8} tone="faint" /></span>
      <span className="flex items-center gap-2">
        <Skeleton width={14} height={14} />
        <Skeleton line={20} width={width} height={10} />
      </span>
      {/* New category (+) and the project's actions (⋯). */}
      <span className="ml-auto flex items-center gap-1">
        <Skeleton width={26} height={26} round="md" tone="faint" />
        <Skeleton width={26} height={26} round="md" tone="faint" />
      </span>
    </div>
  )
}

/** A category row: indented under its project's name, its mark, name and group count; lit when selected. */
function CategoryRow({ width, groups, active }: { width: number; groups: number; active: boolean }) {
  return (
    <div className="mx-2 flex h-8 items-center gap-2 rounded-md pl-7 pr-1" style={active ? { backgroundColor: "var(--accent-subtle)" } : undefined}>
      <Skeleton width={12} height={12} />
      <Skeleton line={20} width={width} height={10} tone="faint" />
      {groups > 0 && <span className="ml-auto"><ActionSlot><Skeleton width={8} height={8} tone="faint" /></ActionSlot></span>}
    </div>
  )
}

/**
 * A category's header band (ContentPanel's CategoryHeader): its mark, name, then its counts as the
 * text reads ("5 groups · 1 unsorted", either part only when there is one), New group on the right.
 */
function CategoryHeader({ groups, unsorted }: { groups: number; unsorted: boolean }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ink/[0.12] px-6">
      <Skeleton width={16} height={16} />
      <Skeleton line={24} width={72} height={14} />
      {(groups > 0 || unsorted) && (
        <span className="flex items-center">
          {groups > 0 && <Skeleton line={16} width={50} height={8} tone="faint" />}
          {groups > 0 && unsorted && <span className="flex w-2.5 justify-center"><Skeleton width={3} height={3} round="full" tone="faint" /></span>}
          {unsorted && <Skeleton line={16} width={59} height={8} tone="faint" />}
        </span>
      )}
      <span className="ml-auto"><Skeleton width={100} height={32} round="md" tone="faint" /></span>
    </div>
  )
}

/**
 * A group as TabGroup draws it: the same block spacing, card padding and header row (from the
 * density variables), its tabs in list or grid. Unsorted is a borderless tinted tray with no ⋯.
 */
function GroupBlock({ tabs, unsorted = false, nameWidth = 88, layout, gridColumns }: {
  tabs: number; unsorted?: boolean; nameWidth?: number; layout: "list" | "grid"; gridColumns: number
}) {
  const grid: CSSProperties = layout === "grid"
    ? { gridTemplateColumns: `repeat(auto-fill, minmax(max(${GRID_MIN_CELL}, calc((100% - ${gridColumns - 1} * var(--density-gap-group)) / ${gridColumns})), 1fr))` }
    : {}
  return (
    <div style={{ paddingTop: "var(--density-p-section)", paddingInline: GROUP_INLINE }}>
      <div className={`flex flex-col rounded-card border ${unsorted ? "border-transparent bg-ink/[0.04]" : "border-ink/[0.08] bg-ink/[0.015]"}`}
        style={{ padding: "var(--density-p-group)", gap: "var(--density-p-group)" }}>
        <div className="flex min-h-group-head items-center gap-2" style={{ paddingInline: "var(--density-px-tab)" }}>
          <span className="flex w-5 justify-center"><Skeleton width={14} height={14} /></span>
          <Skeleton line={20} width={unsorted ? 64 : nameWidth} height={10} />
          <Skeleton line={16} width={unsorted ? 180 : 36} height={8} tone="faint" />
          {/* Open all tabs, and the group's ⋯ (Unsorted has none). */}
          <span className="ml-auto flex items-center gap-0.5">
            {(!unsorted || tabs > 0) && <Skeleton width={26} height={26} round="md" tone="faint" />}
            {!unsorted && <Skeleton width={26} height={26} round="md" tone="faint" />}
          </span>
        </div>
        {tabs > 0 ? (
          <div className={layout === "grid" ? "grid" : "flex flex-col"} style={{ gap: "var(--density-gap-group)", ...grid }}>
            {Array.from({ length: tabs }, (_, t) => <SavedTabRow key={t} i={t} />)}
          </div>
        ) : (
          <EmptyDrop />
        )}
      </div>
    </div>
  )
}

/** An empty group's or category's drop line (TabGroup's EmptyDropRow): one saved-tab row tall, dashed. */
function EmptyDrop() {
  return <div className="rounded-lg border border-dashed border-ink/[0.12]" style={{ minHeight: "calc(var(--density-py-tab) * 2 + 2rem)" }} />
}

/** An empty category before anything is saved (ContentPanel's EmptySectionDrop): its two lines and Save all tabs. */
function FirstRunDrop() {
  return (
    <div className="flex items-center justify-between gap-6 rounded-lg border border-dashed border-ink/[0.12]" style={{ padding: "var(--density-p-group) var(--density-px-tab)" }}>
      <div className="flex flex-col gap-1">
        <Skeleton line={20} width={210} height={11} />
        <Skeleton line={16} width={230} height={8} tone="faint" />
      </div>
      <Skeleton width={98} height={32} round="md" tone="faint" />
    </div>
  )
}

/** A saved tab as SavedTabItem draws it: favicon, title and address, on the row surface. */
function SavedTabRow({ i }: { i: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-row" style={{ padding: "var(--density-py-tab) var(--density-px-tab)" }}>
      <Skeleton width={20} height={20} round="full" tone="faint" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton line={16} width={`${[42, 30, 36][i % 3]}%`} height={9} />
        <Skeleton line={15} width={`${[28, 22, 32][i % 3]}%`} height={7} tone="faint" />
      </div>
    </div>
  )
}

/** An Opened tabs row: favicon, title and address. */
function OpenTabRow({ i }: { i: number }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5">
      <Skeleton width={20} height={20} round="full" tone="faint" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton line={16} width={`${[60, 48, 54][i % 3]}%`} height={9} />
        <Skeleton line={15} width={`${[44, 36, 40][i % 3]}%`} height={7} tone="faint" />
      </div>
    </div>
  )
}
