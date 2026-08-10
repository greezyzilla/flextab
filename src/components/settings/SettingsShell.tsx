import type { ReactNode } from "react"
import { useEffect } from "react"
import { useRoute, navigate, goBack } from "~src/lib/route"
import { SETTINGS_ROUTE, SECTION_LABEL, tabFromRoute, type SettingsTab } from "./types"
import { AppearanceTab } from "./AppearanceTab"
import { SyncTab } from "./SyncTab"
import { BackupTab } from "./BackupTab"
import { PlanTab } from "./PlanTab"
import { TransactionsTab } from "./TransactionsTab"
import { AccountTab } from "./AccountTab"
import { PaletteIcon, SyncIcon, HistoryIcon, PlanIcon, ReceiptIcon, UserIcon } from "./icons"
import { Tabs, TabsList, TabsTrigger } from "~src/components/ui/tabs"

const NAV: { id: SettingsTab; icon: ReactNode; label: string }[] = [
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
    <div className="w-64 h-full flex flex-col bg-black-900 shrink-0 font-sans">
      <div className="h-16 p-4 flex items-end border-b border-black-800 shrink-0">
        <h1 className="text-white/90 font-sans text-2xl">Settings</h1>
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
    </div>
  )
}

function SectionContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") goBack() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      <div className="h-16 px-8 flex items-center border-b border-black-800 shrink-0">
        <span className="text-white/80 text-sm font-medium font-sans">{SECTION_LABEL[tab]}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-7">
        <div className="max-w-xl">
          <SectionContent tab={tab} />
        </div>
      </div>
    </div>
  )
}
