// The new tab's tab icon in the accent, as early as a module can run: after the page is
// parsed, before the app bundle. Modules may import, so it shares lib/appIcon with the app.
import { DEFAULT_APPEARANCE, readStoredAppearance } from "~src/lib/theme"
import { applyAppIconFavicon } from "~src/lib/appIcon"

void applyAppIconFavicon(readStoredAppearance() ?? DEFAULT_APPEARANCE).catch(() => { /* the page keeps its own icon */ })
