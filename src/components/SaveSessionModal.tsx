import { useCallback, useMemo, useState } from "react"
import { describeAlsoSaved, savedElsewhere } from "~src/lib/savedUrlIndex"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~src/components/ui/dialog"
import { Button } from "~src/components/ui/button"
import { Input } from "~src/components/ui/input"
import { Label } from "~src/components/ui/label"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { isSavableTabUrl, saveTabsAsGroup } from "~src/services/saveTabsAsGroup"
import { resolveSaveTargetIds } from "~src/services/resolveSaveTarget"
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"
import { DestinationPicker, describeTarget } from "~src/components/DestinationPicker"
import { windowGroupName } from "~src/services/capture"


export function SaveSessionModal({
  tabs,
  onClose,
}: {
  tabs: chrome.tabs.Tab[]
  onClose: () => void
}) {
  const {
    savedSpaces,
    activeSpaceId,
    activeProjectId,
    activeCategoryId,
  } = useSavedSpacesStore()

  const [name, setName] = useState(windowGroupName)
  const [target, setTarget] = useState<SaveTabsTarget>(() =>
    resolveSaveTargetIds(savedSpaces, {
      spaceId: activeSpaceId,
      projectId: activeProjectId,
      categoryId: activeCategoryId,
    }),
  )
  const [saving, setSaving] = useState(false)
  // The picker can create the destination inline, so validity is "the chosen
  // category exists", read from the live tree.
  const destination = describeTarget(savedSpaces, target)

  const savableTabs = useMemo(
    () => tabs.filter((t) => isSavableTabUrl(t.url)),
    [tabs],
  )
  const canSave = !!destination && !!name.trim() && savableTabs.length > 0

  const handleSave = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
    // Where these URLs already were, read before saving (TASK-4).
    const alsoIn = savedElsewhere(useSavedSpacesStore.getState().savedSpaces, savableTabs.map((t) => t.url)).map((l) => l.path)
    try {
      const result = await saveTabsAsGroup({
        target: {
          spaceId: target.spaceId,
          projectId: target.projectId,
          categoryId: target.categoryId,
        },
        name: name.trim(),
        tabs: savableTabs,
      })
      if (!result) {
        toast.error("Couldn't save session", {
          description: "No savable tabs or destination is missing.",
        })
        return
      }
      const notice = describeAlsoSaved(alsoIn)
      if (notice) toast(notice)
      onClose()
    } catch (err) {
      console.error("Save session failed", err)
      toast.error("Couldn't save session", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }, [canSave, target, savableTabs, name, onClose])

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-md p-5">
        <DialogHeader>
          <DialogTitle className="text-fg font-sans text-base font-medium">
            Save Session
          </DialogTitle>
          <DialogDescription>
            {savableTabs.length === 0
              ? "No savable tabs in this window. Browser, extension and local file pages are skipped."
              : `${savableTabs.length} tab${savableTabs.length === 1 ? "" : "s"} will be saved as a group.${
                  tabs.length > savableTabs.length
                    ? ` ${tabs.length - savableTabs.length} browser or extension page${tabs.length - savableTabs.length === 1 ? " is" : "s are"} skipped.`
                    : ""
                }`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="save-session-name">Name</Label>
            <Input
              id="save-session-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) void handleSave()
              }}
              autoFocus
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Save to</Label>
            <DestinationPicker value={target} onChange={setTarget} />
            <span className="text-fg-subtle text-xs font-sans truncate" aria-live="polite">
              {destination ?? "Pick or create a category to save into."}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" onClick={() => void handleSave()} disabled={!canSave || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
