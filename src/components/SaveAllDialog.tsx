import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~src/components/ui/dialog"
import { Button } from "~src/components/ui/button"
import { Label } from "~src/components/ui/label"
import { Switch } from "~src/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "~src/components/ui/radio-group"
import { showUndoToast } from "~src/components/ui/sonner"
import { DestinationPicker, describeTarget } from "~src/components/DestinationPicker"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { useUIStore } from "~src/store/useUIStore"
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

  const save = async () => {
    if (!destination || chosenCount === 0 || saving) return
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
      showUndoToast(`Saved ${saved} tab${saved === 1 ? "" : "s"} to ${destination}`, () => {
        void Promise.all(receipts.map((r) => undoCapture(r)))
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-md p-5">
        <DialogHeader>
          <DialogTitle className="text-white/90 font-sans text-base font-medium">Save all tabs</DialogTitle>
          <DialogDescription>
            {total === 0
              ? "No savable tabs are open. Browser, extension and local file pages are skipped."
              : `${total} tab${total === 1 ? "" : "s"} open in ${withTabs.length} window${withTabs.length === 1 ? "" : "s"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="flex flex-col gap-2" aria-label="What to save">
            <Label htmlFor="save-all-window" className="flex items-center gap-2.5 font-normal">
              <RadioGroupItem value="window" id="save-all-window" />
              This window ({currentCount} tab{currentCount === 1 ? "" : "s"})
            </Label>
            <Label htmlFor="save-all-all" className="flex items-center gap-2.5 font-normal">
              <RadioGroupItem value="all" id="save-all-all" />
              All windows ({total} tab{total === 1 ? "" : "s"}, one group per window)
            </Label>
          </RadioGroup>

          <div className="flex flex-col gap-1.5">
            <Label>Save to</Label>
            <DestinationPicker value={target} onChange={setTarget} maxHeightClass="max-h-48" />
          </div>

          <label className="flex items-center justify-between gap-2 text-sm text-white/75">
            <span>Close tabs after saving <span className="text-white/45">(pinned tabs stay open)</span></span>
            <Switch checked={closeAfter} aria-label="Close tabs after saving"
              onCheckedChange={(v) => { setCloseAfter(v); void saveCloseAfterSave(v) }} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="default" onClick={() => void save()} disabled={!destination || chosenCount === 0 || saving}>
            {saving ? "Saving…" : `Save ${chosenCount} tab${chosenCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
