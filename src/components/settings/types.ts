export type SettingsTab = "spaces" | "saving" | "appearance" | "sync" | "backup" | "plan" | "transactions" | "account";

export const SETTINGS_TABS: SettingsTab[] = [
  "spaces", "saving", "appearance", "sync", "backup", "plan", "transactions", "account",
];

export const SETTINGS_ROUTE = "/settings";

export function isSettingsRoute(route: string): boolean {
  return route === SETTINGS_ROUTE || route.startsWith(SETTINGS_ROUTE + "/");
}

export function tabFromRoute(route: string): SettingsTab {
  const seg = route.replace(/^\/settings\/?/, "").split("/")[0];
  return (SETTINGS_TABS as string[]).includes(seg) ? (seg as SettingsTab) : "appearance";
}

export const SECTION_LABEL: Record<SettingsTab, string> = {
  spaces: "Spaces",
  saving: "Saving",
  appearance: "Appearance",
  sync: "Sync",
  backup: "Backup",
  plan: "Plan & Usage",
  transactions: "Transactions",
  account: "Account",
};
