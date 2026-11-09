import { useEffect, useState } from "react"
import { describeAlsoSaved } from "~src/lib/savedUrlIndex"
import { Switch } from "~src/components/ui/switch"
import { RadioGroup } from "~src/components/ui/radio-group"
import { Modal, ModalBody, ModalField, ModalFooter, ModalHeader, ModalRadio } from "~src/components/ui/modal"
import { showUndoToast } from "~src/components/ui/sonner"
import { DestinationPicker, describeTarget } from "~src/components/DestinationPicker"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { tabCap, usePlanStore } from "~src/store/usePlanStore"
import { spaceTabCount } from "~src/services/spacesTree"
import { isSavableTabUrl, type SaveTabsTarget } from "~src/services/saveTabsAsGroup"
import { resolveSaveTargetIds } from "~src/services/resolveSaveTarget"
import {
  captureTabs, closeSavedTabs, isCaptureFailure, loadCloseAfterSave, saveCloseAfterSave,
  undoCapture, windowGroupName, type CaptureReceipt,
} from "~src/services/capture"

type Scope = "window" | "all"

/**
 * "Save all tabs" (TASK-2): say what will be saved before saving it, and let
 * the user pick this window or every window (one group per window).
 */
export function SaveAllDialog() {
  const open = useUIStore((s) => s.saveAllOpen)
  const setOpen = useUIStore((s) => s.setSaveAllOpen)
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore()
  const [windows, setWindows] = useState<chrome.windows.Window[]>([])
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null)
  const [scope, setScope] = useState<Scope>("window")
  const [target, setTarget] = useState<SaveTabsTarget>({ spaceId: "", projectId: "", categoryId: "" })
  const [closeAfter, setCloseAfter] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (useAuthStore.getState().isAuthenticated) void usePlanStore.getState().load()
    setTarget(resolveSaveTargetIds(savedSpaces, { spaceId: activeSpaceId, projectId: activeProjectId, categoryId: activeCategoryId }))
    void loadCloseAfterSave().then(setCloseAfter)
    void Promise.all([chrome.windows.getAll({ populate: true }), chrome.windows.getCurrent()])
      .then(([all, current]) => {
        setWindows(all)
        setCurrentWindowId(current.id ?? null)
        // Nothing to save here (e.g. only FlexTab open): start from all windows.
        const here = all.find((w) => w.id === current.id)
        setScope((here?.tabs ?? []).some((t) => isSavableTabUrl(t.url)) ? "window" : "all")
      })
      .catch(() => setWindows([]))
  }, [open])

  const savable = (w: chrome.windows.Window) => (w.tabs ?? []).filter((t) => isSavableTabUrl(t.url))
  const withTabs = windows.filter((w) => savable(w).length > 0)
  const total = withTabs.reduce((n, w) => n + savable(w).length, 0)
  const current = windows.find((w) => w.id === currentWindowId)
  const currentCount = current ? savable(current).length : 0
  const chosen = scope === "window" ? (current ? [current] : []) : withTabs
  const chosenCount = chosen.reduce((n, w) => n + savable(w).length, 0)
  const destination = describeTarget(savedSpaces, target)
  // No spaces at all (TASK-37): the save creates the default space.
  const createsSpace = savedSpaces.length === 0
  // Say before saving when this crosses the plan's sync cap (TASK-9). Saving
  // locally is never blocked; only sync pauses until tabs are removed.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const cap = tabCap(usePlanStore((s) => s.status))
  const after = savedSpaces.reduce((n, sp) => n + spaceTabCount(sp), 0) + chosenCount
  const overCap = isAuthenticated && cap !== undefined && cap > 0 && after > cap

  const save = async () => {
    if ((!destination && !createsSpace) || chosenCount === 0 || saving) return
    setSaving(true)
    try {
      const receipts: CaptureReceipt[] = []
      for (const [i, w] of chosen.entries()) {
        const name = chosen.length > 1 ? `${windowGroupName()} (${i + 1})` : windowGroupName()
        const result = await captureTabs(w.tabs ?? [], { ...target, newGroupName: name })
        if (isCaptureFailure(result)) continue
        const closed = closeAfter ? await closeSavedTabs(w.tabs ?? []) : []
        receipts.push({ ...result, closed })
      }
      const saved = receipts.reduce((n, r) => n + r.tabIds.length, 0)
      setOpen(false)
      const alsoIn = [...new Set(receipts.flatMap((r) => r.alsoIn ?? []))]
      const where = destination ?? (receipts[0] && describeTarget(useSavedSpacesStore.getState().savedSpaces, receipts[0].target))
      showUndoToast(`Saved ${saved} tab${saved === 1 ? "" : "s"} to ${where}`, () => {
        void Promise.all(receipts.map((r) => undoCapture(r)))
      }, 5000, describeAlsoSaved(alsoIn) ?? undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal kind="dialog" size="m" open={open} onOpenChange={setOpen}>
      <ModalHeader title="Save all tabs"
        description={total === 0
          ? "No savable tabs are open. Browser, extension and local file pages are skipped."
          : `${total} tab${total === 1 ? "" : "s"} open in ${withTabs.length} window${withTabs.length === 1 ? "" : "s"}.`} />
      <ModalBody>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="flex flex-col gap-2" aria-label="What to save">
          {/* A window with nothing savable is not a choice (TASK-42). */}
          {currentCount > 0 && (
            <ModalRadio id="save-all-window" value="window" count={`${currentCount} tab${currentCount === 1 ? "" : "s"}`}>This window</ModalRadio>
          )}
          <ModalRadio id="save-all-all" value="all" count={`${total} tab${total === 1 ? "" : "s"}, one group per window`}>All windows</ModalRadio>
        </RadioGroup>

        <ModalField label="Save to">
          <DestinationPicker value={target} onChange={setTarget} maxHeightClass="max-h-48" />
        </ModalField>

        <label className="flex min-h-6 items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm leading-5 text-fg">Close tabs after saving</span>
            <span className="text-xs leading-4 text-fg-subtle">Pinned tabs stay open</span>
          </span>
          <Switch checked={closeAfter} aria-label="Close tabs after saving"
            onCheckedChange={(v) => { setCloseAfter(v); void saveCloseAfterSave(v) }} />
        </label>
        {overCap && (
          <p role="note" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-warning-body/90 text-xs leading-relaxed">
            This puts you at {after} of {cap} tabs. Sync pauses until you remove {after - cap}. The tabs still save on this device.
          </p>
        )}
      </ModalBody>
      <ModalFooter primary={{
        label: saving ? "Saving…" : `Save ${chosenCount} tab${chosenCount === 1 ? "" : "s"}`,
        disabled: (!destination && !createsSpace) || chosenCount === 0 || saving,
        onClick: () => void save(),
      }} />
    </Modal>
  )
}
