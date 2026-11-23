import * as yjs from "~src/lib/yjsDoc"
import { seedDefaultWorkspace } from "~src/lib/defaultPath"

/**
 * The first-install workspace (TASK-127). The background runs this once, on
 * onInstalled "install", so a single writer seeds: pages never do. Seeds only a
 * workspace that is absent, never one that is stored (even empty), unreadable,
 * or missing while sync history remains. True when it seeded.
 */
export async function seedFirstInstall(): Promise<boolean> {
  let loaded: boolean
  try {
    loaded = await yjs.loadPersistedState()
  } catch (_) {
    return false
  }
  if (loaded || !seedDefaultWorkspace()) return false
  await yjs.persistState()
  return true
}
