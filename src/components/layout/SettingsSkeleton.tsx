import { useState } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { Skeleton, SkeletonRegion } from "~src/components/ui/skeleton"
import { ACCOUNT_ONLY, SETTINGS_ROUTE, SETTINGS_TABS, settingsGroupsFor, tabFromRoute, type SettingsTab } from "~src/components/settings/types"
import { TILE_PADDING } from "~src/components/settings/shared"
import { readStoredShellShape } from "~src/lib/shellShape"
import { currentDensity, readStoredSettingsShape, settingsColumnWidth, settingsPageShape, type SettingsPageShape, type SettingsRowShape } from "~src/lib/settingsShape"
import { cn } from "~src/lib/utils"
import { PANEL_HEADER, PANEL_LIST, PANEL_ROW, PANEL_ROW_LABEL } from "./panelChrome"
import { PanelFooterSkeleton, RailSkeleton, skeletonHeight } from "./ShellSkeleton"

/** localStorage copies of each Settings page's skeleton markup for boot/shell.js (TASK-108), by topic. */
export const SETTINGS_SKELETON_STORAGE_KEY = "flextab-settings-skeleton"

/** Theme, Display and Layout: the previewer sits beside the controls (SettingsContent). */
const APPEARANCE: SettingsTab[] = ["theme", "display", "layout"]

/** Sample widths for the bars that stand in for names, picked by position. */
const W = [72, 96, 60, 84, 108, 66]
const w = (i: number) => W[i % W.length]

/**
 * A Settings page while the new tab loads (TASK-108): the shell AppShell draws on a Settings route,
 * at its real widths and lines: the rail, the Settings nav, and the open page's header, cards and
 * rows in the shape the page had when it was last seen (lib/settingsShape.ts), or its topic's
 * sample. Pure, so the boot copy and React's render are the same markup.
 */
export function SettingsSkeletonView({ tab, page, signedIn, spaces }: { tab: SettingsTab; page: SettingsPageShape; signedIn: boolean; spaces: number }) {
  const height = skeletonHeight()
  // The rail cuts its spaces at the screen as the workspace skeleton does (fitToScreen: 52px each).
  const railSpaces = Math.min(spaces, Math.ceil(height / 52) + 2)
  return (
    <SkeletonRegion label="Loading Settings">
      <div className="flex h-screen w-screen overflow-hidden bg-black-900">
        <RailSkeleton spaces={railSpaces} />

        {/* SettingsNav: hidden below md, as the real one. */}
        <div className="hidden md:flex w-64 h-full flex-col bg-black-900 shrink-0">
          <div className={PANEL_HEADER}>
            <Skeleton line={32} width={96} height={18} />
          </div>
          <div className={cn(PANEL_LIST, "flex flex-col gap-6 overflow-hidden")}>
            {settingsGroupsFor(signedIn).map((group, gi) => (
              <div key={group.heading} className="flex flex-col">
                <div className="px-4 pb-1.5"><Skeleton line={16} width={w(gi + 3) - 8} height={8} tone="faint" /></div>
                <div className="flex flex-col">
                  {group.topics.map((id, ti) => (
                    <div key={id} className={PANEL_ROW} style={id === tab ? { backgroundColor: "var(--accent-subtle)" } : undefined}>
                      <div className={cn(PANEL_ROW_LABEL, "w-full px-1")}>
                        <Skeleton width={16} height={16} tone="faint" />
                        <Skeleton line={20} width={w(gi * 3 + ti)} height={10} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <PanelFooterSkeleton />
        </div>

        {/* The page (SettingsContent in AppShell's bordered main). */}
        <div className="border-x border-line flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0 min-w-0">
            <div className="min-h-16 px-4 py-3 sm:px-6 md:px-8 flex flex-col md:flex-row md:items-center md:justify-between justify-center gap-1.5 border-b border-line shrink-0">
              <span className="hidden md:block"><Skeleton line={32} width={w(SETTINGS_TABS.indexOf(tab)) + 40} height={18} /></span>
              {/* Below md: the "Settings section" label and its select. */}
              <span className="md:hidden"><Skeleton line={16} width={96} height={8} tone="faint" /></span>
              <span className="md:hidden"><Skeleton width="100%" height={32} round="md" tone="faint" /></span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden px-4 py-5 sm:px-6 md:px-8 md:py-7">
              {APPEARANCE.includes(tab) ? (
                <div className="flex flex-col preview:flex-row preview:items-start gap-6 preview:gap-8">
                  <div className="max-w-[40rem] min-w-0 preview:w-full preview:shrink-0"><Cards page={page} height={height} /></div>
                  <div className="hidden preview:block preview:max-w-[24rem] preview:flex-1 preview:min-w-0">
                    {page.preview !== null && <Skeleton width="100%" height={page.preview} round="lg" tone="faint" />}
                  </div>
                </div>
              ) : (
                <div className="max-w-[40rem] min-w-0"><Cards page={page} height={height} /></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SkeletonRegion>
  )
}

/** The page's section cards, stopping once they pass the bottom of the screen. */
function Cards({ page, height }: { page: SettingsPageShape; height: number }) {
  let used = 0
  const shown = page.cards.filter((c) => {
    if (used > height) return false
    used += c.gapBefore + 56 + c.rows.reduce((n, r) => n + (r.tile === false ? r.height : r.content + 28) + 10, 0)
    return true
  })
  return (
    <div className="flex flex-col">
      {shown.map((c, ci) => (
        // SettingsSection: one card per section, its header box inside, density padding and gaps.
        <div key={ci} className="flex flex-col rounded-card border border-ink/[0.08] bg-ink/[0.015]"
          style={{ marginTop: c.gapBefore, padding: "var(--density-p-group)", gap: "calc(var(--density-p-group) * 4 / 3)" }}>
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton width={40} height={40} round="lg" />
            <div className="flex min-w-0 flex-col">
              <Skeleton line={24} width={w(ci) + 24} height={12} />
              <Skeleton line={16} width={w(ci + 2) + 80} height={8} tone="faint" />
            </div>
          </div>
          {c.notice !== null && <Skeleton width="100%" height={c.notice} round="lg" tone="faint" />}
          <div className="ft-setting-rows flex flex-col" style={{ gap: "calc(var(--density-gap-group) * 5 / 3)" }}>
            {c.rows.map((r, ri) => <Row key={ri} row={r} i={ci + ri} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

/** A SettingRow tile (label and description on the left, its control on the right) or another row's box. */
function Row({ row, i }: { row: SettingsRowShape; i: number }) {
  if (row.tile === false) return <Skeleton width="100%" height={row.height} round="lg" tone="faint" />
  // Arranged as SettingRow is (ft-setting-tile-skel, TASK-123): label over control until the row has
  // 34rem, then side by side. The name bars never pass the room the control leaves them.
  return (
    <div className="rounded-lg bg-row" style={{ padding: TILE_PADDING }}>
      <div className="ft-setting-tile-skel" style={{ height: row.content }}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton line={20} width={`min(${w(i) + 20}px, 100%)`} height={10} />
          <Skeleton line={16} width={`min(${w(i + 1) + 100}px, 100%)`} height={8} tone="faint" />
        </div>
        <span><Skeleton width={row.control[0]} height={row.control[1]} round="md" tone="faint" /></span>
      </div>
    </div>
  )
}

/**
 * What the skeleton draws for a Settings route: the topic it opens (as SettingsContent resolves it,
 * with the nav the user had), that page's shape, and the rail's space count.
 */
export function settingsSkeletonFor(route: string) {
  const settings = readStoredSettingsShape()
  const signedIn = settings?.signedIn ?? false
  const tab = tabFromRoute(route, signedIn)
  return { tab, page: settingsPageShape(settings, tab, settingsColumnWidth(window.innerWidth), currentDensity()), signedIn, spaces: readStoredShellShape()?.spaces ?? 2 }
}

/** The new tab on a Settings route while it loads (newtab/index.tsx). */
export function SettingsSkeleton({ route }: { route: string }) {
  const [props] = useState(() => settingsSkeletonFor(route))
  return <SettingsSkeletonView {...props} />
}

/**
 * Renders this topic's skeleton off screen and keeps its markup for the next new tab opened on it:
 * boot/shell.js puts it in the page before the first paint. Signed out, the copies of account pages
 * go: a guest opening one lands on the default page instead.
 */
export function storeSettingsSkeletonMarkup(tab: SettingsTab) {
  const props = settingsSkeletonFor(`${SETTINGS_ROUTE}/${tab}`)
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<SettingsSkeletonView {...props} />))
    const copies = readCopies()
    if (!props.signedIn) for (const t of ACCOUNT_ONLY) delete copies[t]
    copies[props.tab] = { html: host.innerHTML, height: skeletonHeight(), width: window.innerWidth, density: currentDensity() }
    localStorage.setItem(SETTINGS_SKELETON_STORAGE_KEY, JSON.stringify(copies))
  } catch {
    // Storage blocked or full: the next new tab on this page shows the themed surface until its script runs.
  } finally {
    root.unmount()
  }
}

function readCopies(): Record<string, { html: string; height: number; width: number; density: string }> {
  try {
    const c = JSON.parse(localStorage.getItem(SETTINGS_SKELETON_STORAGE_KEY) || "null")
    return c && typeof c === "object" && !Array.isArray(c) ? c : {}
  } catch {
    return {}
  }
}
