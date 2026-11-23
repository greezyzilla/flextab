/**
 * What runs when the browser installs FlexTab (TASK-113). onInstalled fires for a
 * first install, for every update of FlexTab, and when the browser itself
 * updates; each reason runs only its own steps.
 *
 * There is no first-install-only work yet. When some arrives (a welcome page,
 * seeding), it goes in the "install" list only, never in the shared one, so an
 * update cannot run it again.
 */
export type InstallStep = "deviceId" | "menus" | "restoreTabs" | "initialPush"

/** Idempotent setup every start of a new install or version needs. */
const EVERY_INSTALL: InstallStep[] = ["deviceId", "menus", "initialPush"]

export function installSteps(reason: string): InstallStep[] {
  switch (reason) {
    case "install":
      return [...EVERY_INSTALL]
    case "update":
      // Bring back the pages the update reload dropped, then push what they left pending.
      return ["deviceId", "menus", "restoreTabs", "initialPush"]
    default:
      // chrome_update / shared_module_update: FlexTab itself did not change.
      return [...EVERY_INSTALL]
  }
}

export async function runInstallSteps(reason: string, steps: Record<InstallStep, () => unknown>): Promise<void> {
  for (const step of installSteps(reason)) {
    try { await steps[step]() } catch (_) { /* one failed step must not stop the rest */ }
  }
}
