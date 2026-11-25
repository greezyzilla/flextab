import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { LOCK_FILE, isAlive, removeDevLock, runningWatcher, writeDevLock } from "./dev-lock.mjs"

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dev-lock-"))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("dev watcher lock", () => {
  it("finds no watcher without a lock", () => {
    expect(runningWatcher(dir)).toBeNull()
  })

  it("finds the watcher while its PID is alive", () => {
    writeDevLock(dir, 4242)
    expect(runningWatcher(dir, (pid) => pid === 4242)).toBe(4242)
  })

  it("ignores a lock left by a killed watcher", () => {
    writeDevLock(dir, 4242)
    expect(runningWatcher(dir, () => false)).toBeNull()
  })

  it("ignores a lock that holds no PID", () => {
    writeFileSync(join(dir, LOCK_FILE), "not a pid\n")
    expect(runningWatcher(dir, () => true)).toBeNull()
  })

  it("sees this process as alive", () => {
    writeDevLock(dir)
    expect(runningWatcher(dir)).toBe(process.pid)
    expect(isAlive(process.pid)).toBe(true)
  })

  it("removes only its own lock", () => {
    writeDevLock(dir, 4242)
    removeDevLock(dir, 1111)
    expect(readFileSync(join(dir, LOCK_FILE), "utf8")).toBe("4242\n")
    removeDevLock(dir, 4242)
    expect(existsSync(join(dir, LOCK_FILE))).toBe(false)
  })
})
