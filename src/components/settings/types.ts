/**
 * Settings topics. Each is one page; the left nav groups them under
 * headings, so every topic is one click away and no page has sub-tabs.
 */
export type SettingsTab =
  | "spaces" | "saving" | "backup"
  | "theme" | "display" | "layout"
  | "profile" | "security" | "plan";

/**
 * The nav: three headed groups of three topics, each topic one job, no row
 * alone. Room to grow without a new heading: Workspace (what you keep and how
 * it is saved, opened, synced and backed up; e.g. shortcuts, import from other
 * apps), Appearance, Account (who you are, how you sign in, what you pay; e.g.
 * emails from FlexTab, forgot password in Sign-in & security).
 */
export const SETTINGS_GROUPS: { heading: string; topics: SettingsTab[] }[] = [
  { heading: "Workspace", topics: ["spaces", "saving", "backup"] },
  { heading: "Appearance", topics: ["theme", "display", "layout"] },
  { heading: "Account", topics: ["profile", "security", "plan"] },
];

export const SETTINGS_TABS: SettingsTab[] = SETTINGS_GROUPS.flatMap(g => g.topics);

/** Pages that only exist with an account: a guest does not see them in Settings at all. */
export const ACCOUNT_ONLY: SettingsTab[] = ["profile", "security", "plan"];

/** The navigation a user sees: a guest's has no account pages (and no group left empty by that). */
export function settingsGroupsFor(signedIn: boolean) {
  if (signedIn) return SETTINGS_GROUPS;
  return SETTINGS_GROUPS.map(g => ({ ...g, topics: g.topics.filter(t => !ACCOUNT_ONLY.includes(t)) })).filter(g => g.topics.length > 0);
}

export const SETTINGS_ROUTE = "/settings";

/** Where a link to an old Settings page lands: the page it named became these topics. */
const LEGACY: Record<string, SettingsTab> = {
  appearance: "theme",
  account: "profile",
  transactions: "plan",
  opening: "saving",
  sync: "backup",
};

/** Opening Settings without a topic, as the rail's gear does. */
export const DEFAULT_SETTINGS_TAB: SettingsTab = "theme";

export function isSettingsRoute(route: string): boolean {
  return route === SETTINGS_ROUTE || route.startsWith(SETTINGS_ROUTE + "/");
}

export function tabFromRoute(route: string, signedIn = true): SettingsTab {
  const seg = route.replace(/^\/settings\/?/, "").split("/")[0];
  const tab = (SETTINGS_TABS as string[]).includes(seg) ? seg as SettingsTab : LEGACY[seg] ?? DEFAULT_SETTINGS_TAB;
  // A guest following a link to an account page lands on the default page instead.
  return !signedIn && ACCOUNT_ONLY.includes(tab) ? DEFAULT_SETTINGS_TAB : tab;
}

export const SECTION_LABEL: Record<SettingsTab, string> = {
  spaces: "Spaces",
  saving: "Saving & opening",
  backup: "Sync & backup",
  theme: "Theme",
  display: "Display",
  layout: "Layout",
  profile: "Profile",
  security: "Sign-in & security",
  plan: "Plan & billing",
};
