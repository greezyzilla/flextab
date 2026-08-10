// Settings UI is split under ./settings/* (FE-B7). This file re-exports the public API.
export {
  SETTINGS_ROUTE,
  isSettingsRoute,
  SettingsNav,
  SettingsContent,
} from "./settings";
export type { SettingsTab } from "./settings";
