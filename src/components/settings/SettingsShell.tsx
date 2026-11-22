import type { ReactNode } from "react"
import { useEffect, useId } from "react"
import { useRoute, navigate, goBack } from "~src/lib/route"
import { SETTINGS_ROUTE, SECTION_LABEL, settingsGroupsFor, tabFromRoute, type SettingsTab } from "./types"
import { useAuthStore } from "~src/store/useAuthStore"
import { SpacesTab } from "./SpacesTab"
import { SavingTab } from "./SavingTab"
import { ThemeTab, DisplayTab, LayoutTab, OpeningTab } from "./AppearanceTab"
import { AppearancePreview } from "./AppearancePreview"
import { SyncTab } from "./SyncTab"
import { BackupTab } from "./BackupTab"
import { PlanTab } from "./PlanTab"
import { TransactionsTab } from "./TransactionsTab"
import { ProfileTab, SecurityTab } from "./AccountTab"
import { SettingsPage } from "./shared"
import { SpacesIcon, SavingIcon, PaletteIcon, DisplayIcon, LayoutIcon, SyncIcon, PlanIcon, UserIcon, SecurityIcon } from "./icons"
import { canGroupTabs } from "~src/services/openTab"
import { cn } from "~src/lib/utils"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "~src/components/ui/select"
import { PANEL_HEADER, PANEL_TITLE, PANEL_LIST, PANEL_ROW, PANEL_ROW_LABEL, PANEL_ROW_TEXT, PanelFooter, AppVersion } from "~src/components/layout/panelChrome"

const ICON: Record<SettingsTab, ReactNode> = {
  spaces: <SpacesIcon />, saving: <SavingIcon />, backup: <SyncIcon />,
  theme: <PaletteIcon />, display: <DisplayIcon />, layout: <LayoutIcon />,
  profile: <UserIcon />, security: <SecurityIcon />, plan: <PlanIcon />,
}

/** Theme, Display and Layout show the appearance previewer beside their controls. */
const APPEARANCE: SettingsTab[] = ["theme", "display", "layout"]

/** Left navigation column: the workspace panel's frame (TASK-84), so nothing moves between them. */
export function SettingsNav() {
  const signedIn = useAuthStore(s => s.isAuthenticated)
  const active = tabFromRoute(useRoute(), signedIn)
  return (
    <nav aria-label="Settings" className="hidden md:flex w-64 h-full flex-col bg-black-900 shrink-0 font-sans">
      <div className={PANEL_HEADER}>
        <h1 className={PANEL_TITLE}>Settings</h1>
      </div>
      {/* Topics are pages (one route each), so this is navigation with
          aria-current, not tabs (TASK-28). Grouped under headings, every
          topic one click away (TASK-84). */}
      <div className={cn(PANEL_LIST, "flex flex-col gap-6")}>
        {settingsGroupsFor(signedIn).map((group) => {
          const topics = group.topics
          const headingId = `settings-nav-${group.heading.replace(/\W+/g, "-").toLowerCase()}`
          return (
            <div key={group.heading} className="flex flex-col">
              <div id={headingId} className="px-4 pb-1.5 text-fg-subtle text-caption font-medium font-sans uppercase tracking-wider">{group.heading}</div>
              <ul aria-labelledby={headingId} className="flex flex-col">
                {topics.map((id) => (
                  <li key={id} className={cn(PANEL_ROW, active === id ? "text-fg" : "text-fg-muted hover:text-fg hover:bg-ink/[0.04]")}
                    style={active === id ? { backgroundColor: "var(--accent-subtle)" } : undefined}>
                    <a href={`#${SETTINGS_ROUTE}/${id}`} aria-current={active === id ? "page" : undefined} className={cn(PANEL_ROW_LABEL, "w-full px-1")}>
                      <span className="text-fg-subtle">{ICON[id]}</span>
                      <span className={PANEL_ROW_TEXT}>{SECTION_LABEL[id]}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <PanelFooter start={<AppVersion />} />
    </nav>
  )
}

function SectionContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "spaces": return <SpacesTab />
    // Opening holds one browser feature; without tab groups it is left out.
    case "saving": return <SettingsPage><SavingTab />{canGroupTabs() && <OpeningTab />}</SettingsPage>
    case "theme": return <ThemeTab />
    case "display": return <DisplayTab />
    case "layout": return <LayoutTab />
    case "backup": return <SettingsPage><SyncTab /><BackupTab /></SettingsPage>
    case "plan": return <SettingsPage><PlanTab /><TransactionsTab /></SettingsPage>
    case "profile": return <ProfileTab />
    case "security": return <SecurityTab />
  }
}

/** Main content column — same structure as ContentPanel (header + scroll). */
export function SettingsContent() {
  const signedIn = useAuthStore(s => s.isAuthenticated)
  const tab = tabFromRoute(useRoute(), signedIn)
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
      {/* The page's own name is its biggest text: the same 24px as the panel's
          "Settings" and on its baseline. The header holds only that, on every
          page (one Settings, one header). */}
      <div className="min-h-16 px-4 py-3 sm:px-6 md:px-8 flex flex-col md:flex-row md:items-center md:justify-between justify-center gap-1.5 border-b border-line shrink-0">
        <h2 className="hidden md:block text-fg text-2xl font-sans truncate">{SECTION_LABEL[tab]}</h2>
        <label htmlFor={sectionSelectId} className="md:hidden text-fg-muted text-xs font-sans">Settings section</label>
        <div className="md:hidden">
          <Select value={tab} onValueChange={(value) => navigate(`${SETTINGS_ROUTE}/${value}`)}>
            <SelectTrigger id={sectionSelectId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {settingsGroupsFor(signedIn).map(group => (
                <SelectGroup key={group.heading}>
                  <SelectLabel>{group.heading}</SelectLabel>
                  {group.topics.map(id => <SelectItem key={id} value={id}>{SECTION_LABEL[id]}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-7">
        {APPEARANCE.includes(tab) ? (
          // TASK-30 / TASK-84: the previewer sits on the right and stays in view while the controls scroll.
          // Side by side needs the controls (40rem), a 2rem gap and a previewer of 24rem (capped there,
          // so it never outgrows the controls on wide screens): 1440px of window. Narrower, the previewer
          // is not shown at all (user: "preview ga seharusnya muncul di semua size"): above or below the
          // controls it only pushed them off the first screen or out of sight of the change it shows.
          <div className="flex flex-col min-[1440px]:flex-row min-[1440px]:items-start gap-6 min-[1440px]:gap-8">
            <div className="max-w-[40rem] min-w-0 break-words min-[1440px]:w-full min-[1440px]:shrink-0">
              <SectionContent tab={tab} />
            </div>
            {/* The previewer takes all the width the controls leave, up to 24rem, so wide windows fit
                more grid columns without it outgrowing the controls. */}
            <div className="hidden min-[1440px]:block min-[1440px]:max-w-[24rem] min-[1440px]:sticky min-[1440px]:top-0 min-[1440px]:flex-1 min-[1440px]:min-w-0">
              <AppearancePreview />
            </div>
          </div>
        ) : (
          <div className="max-w-[40rem] min-w-0 break-words">
            <SectionContent tab={tab} />
          </div>
        )}
      </div>
    </div>
  )
}
