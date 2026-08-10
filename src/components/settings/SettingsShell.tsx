import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRoute, navigate, goBack } from "~src/lib/route";
import { SETTINGS_ROUTE, SECTION_LABEL, tabFromRoute, type SettingsTab } from "./types";
import { AppearanceTab } from "./AppearanceTab";
import { SyncTab } from "./SyncTab";
import { BackupTab } from "./BackupTab";
import { PlanTab } from "./PlanTab";
import { TransactionsTab } from "./TransactionsTab";
import { AccountTab } from "./AccountTab";
import { PaletteIcon, SyncIcon, HistoryIcon, PlanIcon, ReceiptIcon, UserIcon } from "./icons";

/** Left navigation column — same footprint/styling as LeftPanel. */
export function SettingsNav() {
  const active = tabFromRoute(useRoute());
  return (
    <div className="w-64 h-full flex flex-col bg-black-900 shrink-0 font-sans">
      <div className="h-16 p-4 flex items-end border-b border-black-800 shrink-0">
        <h1 className="text-white/90 font-sans text-2xl">Settings</h1>
      </div>
      <div className="flex flex-col gap-1 p-3 overflow-y-auto">
        <SettingsNavItem id="appearance" icon={<PaletteIcon />} label="Appearance" active={active === "appearance"} />
        <SettingsNavItem id="sync" icon={<SyncIcon />} label="Sync" active={active === "sync"} />
        <SettingsNavItem id="backup" icon={<HistoryIcon />} label="Backup" active={active === "backup"} />
        <SettingsNavItem id="plan" icon={<PlanIcon />} label="Plan & Usage" active={active === "plan"} />
        <SettingsNavItem id="transactions" icon={<ReceiptIcon />} label="Transactions" active={active === "transactions"} />
        <SettingsNavItem id="account" icon={<UserIcon />} label="Account" active={active === "account"} />
      </div>
    </div>
  );
}

function SettingsNavItem({ id, icon, label, active }: { id: SettingsTab; icon: ReactNode; label: string; active: boolean }) {
  return (
    <button
      onClick={() => navigate(`${SETTINGS_ROUTE}/${id}`)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-sans text-sm outline-none transition-colors ${
        active
          ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
          : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "appearance": return <AppearanceTab />;
    case "sync": return <SyncTab />;
    case "backup": return <BackupTab />;
    case "plan": return <PlanTab />;
    case "transactions": return <TransactionsTab />;
    case "account": return <AccountTab />;
  }
}

/** Main content column — same structure as ContentPanel (header + scroll). */
export function SettingsContent() {
  const tab = tabFromRoute(useRoute());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") goBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  );
}
