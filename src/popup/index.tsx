import { useState, useEffect, useRef, useCallback } from "react"
import { describeAlsoSaved } from "~src/lib/savedUrlIndex"
import { WorkspaceLoadError } from "~src/components/WorkspaceLoadError"
import "@fontsource-variable/inter"
import "../../style.css"
import { useSavedSpacesStore, useHydrated } from "~src/store/useSavedSpacesStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { installExternalPersistBridge } from "~src/lib/yjsDoc"
import { Button } from "~src/components/ui/button"
import { Switch } from "~src/components/ui/switch"
import { DestinationPicker, describeDestination, type PickerValue } from "~src/components/DestinationPicker"
import { signInPageUrl } from "~src/lib/workspaceAccess"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import {
  captureTabs, moveCapture, undoCapture, closeSavedTabs, persistCapture, isCaptureFailure,
  loadDefaultDestination, loadCloseAfterSave, saveCloseAfterSave, loadLastCapture, storeLastCapture,
  type CaptureReceipt, type CaptureFailure, type CaptureDestination,
} from "~src/services/capture"

/**
 * Popup = instant save (TASK-2, Pocket/Raindrop pattern): opening it saves the
 * current page to the last destination right away, then offers Change / Undo.
 * The page you are on is never closed by this (closing it would also close
 * the popup and its Undo); "Close tabs after saving" applies to the rest of
 * the window and to the keyboard / right-click window saves.
 */
type Status =
  | { kind: "saving" }
  | { kind: "saved"; receipt: CaptureReceipt }
  | { kind: "already"; destination: CaptureDestination }
  | { kind: "unsavable" }
  | { kind: "choose" }
  | { kind: "removed" }
  | { kind: "failed"; receipt: CaptureReceipt }
  | { kind: "error"; message: string }

const toDestination = (r: CaptureReceipt): CaptureDestination => ({ ...r.target })

function IndexPopup() {
  const { hydrated, error: hydrationError } = useHydrated()
  const { initialize, isAuthenticated, isLoading: authLoading } = useAuthStore()
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore()
  // The workspace is always local and usable once hydrated (TASK-7): the popup
  // saves from the very first click, signed in or not.
  const usable = hydrated

  const [status, setStatus] = useState<Status>({ kind: "saving" })
  const [destination, setDestination] = useState<CaptureDestination | null>(null)
  const [picking, setPicking] = useState(false)
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null)
  const [others, setOthers] = useState<chrome.tabs.Tab[]>([])
  const [windowReceipt, setWindowReceipt] = useState<CaptureReceipt | null>(null)
  const [closeAfter, setCloseAfter] = useState(false)
  const [lastBackground, setLastBackground] = useState<CaptureReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => { initialize() }, [])
  useEffect(() => { if (hydrated) installExternalPersistBridge() }, [hydrated])
  useEffect(() => { void loadCloseAfterSave().then(setCloseAfter) }, [])

  const showCapture = useCallback((result: CaptureReceipt | CaptureFailure, dest: CaptureDestination) => {
    if (isCaptureFailure(result)) {
      setStatus(result.error === "nothing-savable" ? { kind: "unsavable" } : { kind: "choose" })
      if (result.error === "no-destination") setPicking(true)
      return
    }
    setDestination(toDestination(result))
    if (!result.persisted) setStatus({ kind: "failed", receipt: result })
    else if (result.tabIds.length === 0 && result.duplicates > 0) setStatus({ kind: "already", destination: dest })
    else setStatus({ kind: "saved", receipt: result })
  }, [])

  // Save the current page as soon as the popup opens.
  useEffect(() => {
    if (!usable || started.current) return
    started.current = true
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true })
        const current = tabs.find((t) => t.active) ?? null
        setCurrentTab(current)
        setOthers(tabs.filter((t) => t !== current && isSavableTabUrl(t.url)))
        setLastBackground(await loadLastCapture())
        if (!current || !isSavableTabUrl(current.url)) { setStatus({ kind: "unsavable" }); return }
        const dest = await loadDefaultDestination({ spaceId: activeSpaceId, projectId: activeProjectId, categoryId: activeCategoryId })
        if (!dest) { setStatus({ kind: "choose" }); setPicking(true); return }
        showCapture(await captureTabs([current], dest, { dedupe: true }), dest)
      } catch (_) {
        setStatus({ kind: "error", message: "Could not read your tabs. Please try again." })
      }
    })()
  }, [usable])

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try { await work() } finally { setBusy(false) }
  }

  const pickDestination = (picked: PickerValue) => run(async () => {
    setPicking(false)
    const dest: CaptureDestination = { ...picked }
    if (status.kind === "saved") {
      showCapture(await moveCapture(status.receipt, dest), dest)
    } else if (currentTab) {
      showCapture(await captureTabs([currentTab], dest, { dedupe: true }), dest)
    } else {
      setDestination(dest)
    }
  })

  const undo = () => run(async () => {
    if (status.kind !== "saved") return
    await undoCapture(status.receipt)
    setStatus({ kind: "removed" })
  })

  const retry = () => run(async () => {
    if (status.kind !== "failed") return
    if (await persistCapture()) setStatus({ kind: "saved", receipt: { ...status.receipt, persisted: true } })
  })

  const saveOthers = () => run(async () => {
    if (!destination || others.length === 0) return
    const result = await captureTabs(others, destination, { dedupe: true })
    if (isCaptureFailure(result)) return
    const closed = closeAfter ? await closeSavedTabs(others) : []
    setWindowReceipt({ ...result, closed })
    setOthers([])
  })

  const undoOthers = () => run(async () => {
    if (!windowReceipt) return
    await undoCapture(windowReceipt)
    setWindowReceipt(null)
  })

  const undoLastBackground = () => run(async () => {
    if (!lastBackground) return
    await undoCapture(lastBackground)
    await storeLastCapture(null)
    setLastBackground(null)
  })

  if (hydrationError) return <div className="w-72"><WorkspaceLoadError /></div>

  if (authLoading || !hydrated) {
    return (
      <main className="w-72 bg-black-900 p-4 font-sans">
        <div className="text-fg-subtle text-xs text-center">Loading...</div>
      </main>
    )
  }

  // Same rule as the new tab page (TASK-3): guests and signed-out devices
  // that still hold tabs can save; only a fresh install is sent to set up.
  const where = destination ? describeDestination(savedSpaces, destination) : null

  return (
    <main className="w-80 bg-black-900 p-4 font-sans flex flex-col gap-3">
      <h1 className="text-fg text-base font-medium">FlexTab</h1>

      {lastBackground && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-fg-muted">
          <span className="min-w-0 truncate">
            Last shortcut save: {lastBackground.tabIds.length} tab{lastBackground.tabIds.length === 1 ? "" : "s"}
            {lastBackground.closed.length > 0 ? `, ${lastBackground.closed.length} closed` : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={undoLastBackground} disabled={busy}>Undo</Button>
        </div>
      )}

      <section role="status" aria-live="polite" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2">
        {status.kind === "saving" && <p className="text-fg-muted text-xs">Saving this page…</p>}
        {status.kind === "saved" && (
          <>
            <p className="text-xs text-fg"><span className="text-green-400">✓ Saved</span> to</p>
            <p className="text-xs text-fg-muted break-words">{where}</p>
            {/* Same page already saved elsewhere (TASK-4): say where, don't block. */}
            {describeAlsoSaved(status.receipt.alsoIn ?? []) && (
              <p className="text-xs text-fg-subtle break-words">{describeAlsoSaved(status.receipt.alsoIn ?? [])}</p>
            )}
          </>
        )}
        {status.kind === "already" && (
          <>
            <p className="text-xs text-fg">Already saved in</p>
            <p className="text-xs text-fg-muted break-words">{where}</p>
          </>
        )}
        {status.kind === "unsavable" && (
          <>
            <p className="text-xs text-fg">This page can't be saved</p>
            <p className="text-xs text-fg-subtle">Only web pages (http/https) can be saved. Browser, extension and local file pages are skipped.</p>
          </>
        )}
        {status.kind === "choose" && <p className="text-xs text-fg">Choose where to save this page</p>}
        {status.kind === "removed" && <p className="text-xs text-fg">Removed from FlexTab.</p>}
        {status.kind === "failed" && (
          <p role="alert" className="text-xs text-red-400">Could not save to this device. Keep this popup open and retry.</p>
        )}
        {status.kind === "error" && <p role="alert" className="text-xs text-red-400">{status.message}</p>}

        <div className="flex flex-wrap gap-2">
          {status.kind === "saved" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setPicking((p) => !p)} aria-expanded={picking} disabled={busy}>Change</Button>
              <Button variant="ghost" size="sm" onClick={undo} disabled={busy}>Undo</Button>
            </>
          )}
          {status.kind === "already" && (
            <Button variant="secondary" size="sm" onClick={() => setPicking((p) => !p)} aria-expanded={picking} disabled={busy}>Save elsewhere</Button>
          )}
          {status.kind === "removed" && destination && currentTab && (
            <Button variant="secondary" size="sm" disabled={busy}
              onClick={() => run(async () => showCapture(await captureTabs([currentTab], destination, { dedupe: true }), destination))}>
              Save again
            </Button>
          )}
          {status.kind === "failed" && <Button variant="secondary" size="sm" onClick={retry} disabled={busy}>Retry Save</Button>}
        </div>
      </section>

      {picking && (
        <DestinationPicker
          groupLevel
          value={destination ?? { spaceId: activeSpaceId ?? "", projectId: activeProjectId ?? "", categoryId: activeCategoryId ?? "" }}
          onChange={pickDestination}
          maxHeightClass="max-h-56"
        />
      )}

      {destination && (others.length > 0 || windowReceipt) && (
        <div className="flex flex-col gap-2">
          {others.length > 0 && (
            <Button variant="secondary" onClick={saveOthers} disabled={busy} className="w-full">
              Save the other {others.length} tab{others.length === 1 ? "" : "s"} in this window
            </Button>
          )}
          {windowReceipt && (
            <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
              <span>
                Saved {windowReceipt.tabIds.length} more{windowReceipt.closed.length ? `, closed ${windowReceipt.closed.length}` : ""}
              </span>
              <Button variant="ghost" size="sm" onClick={undoOthers} disabled={busy}>Undo</Button>
            </div>
          )}
          <label className="flex items-center justify-between gap-2 text-xs text-fg-muted">
            <span>Close tabs after saving <span className="text-fg-subtle">(pinned tabs stay open)</span></span>
            <Switch checked={closeAfter} aria-label="Close tabs after saving"
              onCheckedChange={(v) => { setCloseAfter(v); void saveCloseAfterSave(v) }} />
          </label>
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={() => chrome.tabs.create({ url: "chrome://newtab" })} className="w-full">
        Open FlexTab Dashboard
      </Button>
      {!isAuthenticated && (
        <Button variant="link" size="sm" onClick={() => chrome.tabs.create({ url: signInPageUrl() })} className="w-full !text-xs !text-fg-subtle hover:!text-fg">
          Sign in to sync across devices
        </Button>
      )}
    </main>
  )
}

export default IndexPopup
