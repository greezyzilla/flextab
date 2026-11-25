/**
 * Tells a build that a `plasmo dev` watcher runs in this checkout.
 *
 * `plasmo dev` and `plasmo build` share `.plasmo/`, so a build next to a
 * running watcher can hand the watcher production files, and the dev
 * extension then talks to the production API. `npm run dev` holds this lock
 * (its own PID) while the watcher runs; `npm run build` refuses while the
 * PID is alive. The lock sits beside `.plasmo/`, not in it: Plasmo empties
 * `.plasmo/` on every start. A lock left by a killed watcher has a dead PID
 * and is ignored.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const LOCK_FILE = ".plasmo-dev.lock"

const lockPath = (dir) => join(dir, LOCK_FILE)

/** True while `pid` is a live process (EPERM: alive, owned by someone else). */
export function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === "EPERM"
  }
}

export function writeDevLock(dir, pid = process.pid) {
  writeFileSync(lockPath(dir), `${pid}\n`)
}

/** Removes the lock only if it is still ours, so a second watcher's lock survives. */
export function removeDevLock(dir, pid = process.pid) {
  if (readLockPid(dir) === pid) rmSync(lockPath(dir), { force: true })
}

function readLockPid(dir) {
  try {
    const pid = Number.parseInt(readFileSync(lockPath(dir), "utf8").trim(), 10)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/** The PID of the watcher running in `dir`, or null. */
export function runningWatcher(dir, alive = isAlive) {
  const pid = readLockPid(dir)
  return pid !== null && alive(pid) ? pid : null
}
