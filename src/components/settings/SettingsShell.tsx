import config from '../../../package.json'
import type { ReactNode } from "react"
import { useEffect, useId } from "react"
import { useRoute, navigate, goBack } from "~src/lib/route"
import { SETTINGS_ROUTE, SECTION_LABEL, tabFromRoute, type SettingsTab } from "./types"
import { SpacesTab } from "./SpacesTab"
import { AppearanceTab } from "./AppearanceTab"
import { SyncTab } from "./SyncTab"
import { BackupTab } from "./BackupTab"
import { PlanTab } from "./PlanTab"
import { TransactionsTab } from "./TransactionsTab"
import { AccountTab } from "./AccountTab"
import { SpacesIcon, PaletteIcon, SyncIcon, HistoryIcon, PlanIcon, ReceiptIcon, UserIcon } from "./icons"
import { Tabs, TabsList, TabsTrigger } from "~src/components/ui/tabs"

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
    <div className="hidden md:flex w-64 h-full flex-col bg-black-900 shrink-0 font-sans">
      <div className="h-16 p-4 flex items-end border-b border-black-800 shrink-0">
        <h1 className="text-fg font-sans text-2xl">Settings</h1>
      </div>
      <Tabs
        value={active}
        onValueChange={(id) => navigate(`${SETTINGS_ROUTE}/${id}`)}
        orientation="vertical"
        className="flex-1 min-h-0 flex flex-col"
      >
        <TabsList className="flex h-auto w-full flex-col items-stretch gap-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="w-full justify-start"
            >
              {item.icon}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* Where people look for it (TASK-15): the workspace header no longer
          spends its top-left on the version. */}
      <div className="shrink-0 border-t border-black-800 px-4 py-3 text-[11px] text-fg-subtle">
        FlexTab v{config.version || "0.0.1"}
      </div>
    </div>
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") goBack() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0 min-w-0">
      <div className="min-h-16 px-4 py-3 sm:px-6 md:px-8 flex flex-col justify-center gap-1.5 border-b border-black-800 shrink-0">
        <span className="hidden md:block text-fg text-sm font-medium font-sans">{SECTION_LABEL[tab]}</span>
        <label htmlFor={sectionSelectId} className="md:hidden text-fg-muted text-xs font-sans">Settings section</label>
        <select
          id={sectionSelectId}
          value={tab}
          onChange={(event) => navigate(`${SETTINGS_ROUTE}/${event.target.value}`)}
          className="md:hidden w-full min-w-0 rounded-md border border-white/15 bg-black-900 px-2 py-2 text-sm text-fg font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {NAV.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-7">
        <div className="max-w-xl min-w-0 break-words">
          <SectionContent tab={tab} />
        </div>
      </div>
    </div>
  )
}
