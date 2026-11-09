import config from '../../../package.json'
import type { ReactNode } from "react"
import { useEffect, useId } from "react"
import { useRoute, navigate, goBack } from "~src/lib/route"
import { SETTINGS_ROUTE, SECTION_LABEL, tabFromRoute, type SettingsTab } from "./types"
import { SpacesTab } from "./SpacesTab"
import { AppearanceTab } from "./AppearanceTab"
import { AppearancePreview } from "./AppearancePreview"
import { SyncTab } from "./SyncTab"
import { BackupTab } from "./BackupTab"
import { PlanTab } from "./PlanTab"
import { TransactionsTab } from "./TransactionsTab"
import { AccountTab } from "./AccountTab"
import { SpacesIcon, PaletteIcon, SyncIcon, HistoryIcon, PlanIcon, ReceiptIcon, UserIcon } from "./icons"
import { cn } from "~src/lib/utils"

const NAV: { id: SettingsTab; icon: ReactNode; label: string }[] = [
  { id: "spaces", icon: <SpacesIcon />, label: "Spaces" },
  { id: "appearance", icon: <PaletteIcon />, label: "Appearance" },
  { id: "sync", icon: <SyncIcon />, label: "Sync" },
  { id: "backup", icon: <HistoryIcon />, label: "Backup" },
  { id: "plan", icon: <PlanIcon />, label: "Plan & Usage" },
  { id: "transactions", icon: <ReceiptIcon />, label: "Transactions" },
  { id: "account", icon: <UserIcon />, label: "Account" },
]

/** Left navigation column — same footprint/styling as LeftPanel. */
export function SettingsNav() {
  const active = tabFromRoute(useRoute())
  return (
    <nav aria-label="Settings" className="hidden md:flex w-64 h-full flex-col bg-black-900 shrink-0 font-sans">
      <div className="h-16 p-4 flex items-end border-b border-line shrink-0">
        <h1 className="text-fg font-sans text-2xl">Settings</h1>
      </div>
      {/* Sections are pages (one route each), so this is navigation with
          aria-current, not tabs: tabs would point at panels that don't exist
          (axe aria-valid-attr-value, TASK-28). Same look as before. */}
      <ul className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto p-3">
        {NAV.map((item) => (
          <li key={item.id}>
            <a
              href={`#${SETTINGS_ROUTE}/${item.id}`}
              aria-current={active === item.id ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium font-sans outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
                active === item.id ? "bg-[var(--accent-subtle)] text-fg-accent" : "text-fg-subtle hover:bg-ink/[0.03] hover:text-fg-muted",
              )}
            >
              {item.icon}
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      {/* Where people look for it (TASK-15): the workspace header no longer
          spends its top-left on the version. */}
      <div className="shrink-0 border-t border-line px-4 py-3 text-[11px] text-fg-subtle">
        FlexTab v{config.version || "0.0.1"}
      </div>
    </nav>
  )
}

function SectionContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "spaces": return <SpacesTab />
    case "appearance": return <AppearanceTab />
    case "sync": return <SyncTab />
    case "backup": return <BackupTab />
    case "plan": return <PlanTab />
    case "transactions": return <TransactionsTab />
    case "account": return <AccountTab />
  }
}

/** Main content column — same structure as ContentPanel (header + scroll). */
export function SettingsContent() {
  const tab = tabFromRoute(useRoute())
  const sectionSelectId = useId()

  useEffect(() => {
    // An Escape already handled (a modal or menu closing, which Radix marks with
    // preventDefault) must not also leave Settings.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) goBack() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0 min-w-0">
      <div className="min-h-16 px-4 py-3 sm:px-6 md:px-8 flex flex-col justify-center gap-1.5 border-b border-line shrink-0">
        <h2 className="hidden md:block text-fg text-sm font-medium font-sans">{SECTION_LABEL[tab]}</h2>
        <label htmlFor={sectionSelectId} className="md:hidden text-fg-muted text-xs font-sans">Settings section</label>
        <select
          id={sectionSelectId}
          value={tab}
          onChange={(event) => navigate(`${SETTINGS_ROUTE}/${event.target.value}`)}
          className="md:hidden w-full min-w-0 rounded-md border border-ink/15 bg-black-900 px-2 py-2 text-sm text-fg font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {NAV.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-7">
        {tab === "appearance" ? (
          // TASK-30: the previewer sits on the right and stays in view while the
          // controls scroll. Side by side needs the controls (36rem), the gap and
          // a previewer of at least 24rem: about 1400px of window. Narrower, it
          // sits above the controls in their 36rem column (as wide as every
          // settings page, never wider than the workspace) and scrolls with
          // the page (pinned, it would cover most of the screen).
          <div className="flex flex-col min-[1400px]:flex-row min-[1400px]:items-start gap-6 min-[1400px]:gap-10">
            <div className="max-w-xl min-w-0 break-words order-2 min-[1400px]:order-1 min-[1400px]:w-full min-[1400px]:shrink-0">
              <SectionContent tab={tab} />
            </div>
            {/* The previewer takes all the width the controls leave, so no dead
                space sits beside it and wide windows fit more grid columns. It can
                never outgrow the workspace column (settings column minus the
                20rem opened-tabs panel), so it never shows more than is possible. */}
            <div className="order-1 max-w-xl min-[1400px]:max-w-none min-[1400px]:order-2 min-[1400px]:sticky min-[1400px]:top-0 min-[1400px]:flex-1 min-[1400px]:min-w-0">
              <AppearancePreview />
            </div>
          </div>
        ) : (
          <div className="max-w-xl min-w-0 break-words">
            <SectionContent tab={tab} />
          </div>
        )}
      </div>
    </div>
  )
}
