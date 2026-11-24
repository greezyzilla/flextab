import { useCallback, useMemo, useState } from "react"
import { describeAlsoSaved, savedElsewhere } from "~src/lib/savedUrlIndex"
import { toast } from "sonner"
import { Input } from "~src/components/ui/input"
import { Modal, ModalBody, ModalField, ModalFooter, ModalHeader } from "~src/components/ui/modal"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { isSavableTabUrl, saveTabsAsGroup } from "~src/services/saveTabsAsGroup"
import { resolveSaveTargetIds } from "~src/services/resolveSaveTarget"
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"
import { DestinationPicker, describeTarget } from "~src/components/DestinationPicker"
import { closeSavedTabs, loadCloseAfter, reopenTabs, windowGroupName } from "~src/services/capture"
import { showUndoToast } from "~src/components/ui/sonner"
import type { SavedGroup } from "~src/types"
import { ensureCategoryPath, ensureSpace } from "~src/lib/defaultPath"


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
  // An edited name must survive a stray outside click (modal standard §2).
  const [initialName] = useState(name)
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
  // No spaces at all: the save creates the default space.
  const createsSpace = savedSpaces.length === 0

  const savableTabs = useMemo(
    () => tabs.filter((t) => isSavableTabUrl(t.url)),
    [tabs],
  )
  const canSave = (!!destination || createsSpace) && !!name.trim() && savableTabs.length > 0

  const handleSave = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
    // Where these URLs already were, read before saving.
    const alsoIn = savedElsewhere(useSavedSpacesStore.getState().savedSpaces, savableTabs.map((t) => t.url)).map((l) => l.path)
    try {
      const into = createsSpace ? ensureCategoryPath(ensureSpace())! : target
      const result = await saveTabsAsGroup({
        target: {
          spaceId: into.spaceId,
          projectId: into.projectId,
          categoryId: into.categoryId,
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
      // Settings › Saving: "Close after saving a window". Undo takes the group back and reopens the tabs.
      const closed = await loadCloseAfter("window") ? await closeSavedTabs(savableTabs) : []
      if (closed.length) {
        showUndoToast(`Saved and closed ${closed.length} tab${closed.length === 1 ? "" : "s"}`, () => {
          useSavedSpacesStore.getState().removeSavedGroup(into.spaceId, into.projectId, into.categoryId, { id: result.groupId } as SavedGroup)
          void reopenTabs(closed)
        }, 5000, notice ?? undefined)
      } else if (notice) toast(notice)
      onClose()
    } catch (err) {
      console.error("Save session failed", err)
      toast.error("Couldn't save session", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }, [canSave, createsSpace, target, savableTabs, name, onClose])

  return (
    <Modal kind="dialog" size="m" open onOpenChange={(o) => { if (!o) onClose() }} dirty={name !== initialName}>
      <ModalHeader title="Save window as a group"
        description={savableTabs.length === 0
          ? "No savable tabs in this window. Browser, extension and local file pages are skipped."
          : `${savableTabs.length} tab${savableTabs.length === 1 ? "" : "s"} will be saved as a group.${
              tabs.length > savableTabs.length
                ? ` ${tabs.length - savableTabs.length} browser or extension page${tabs.length - savableTabs.length === 1 ? " is" : "s are"} skipped.`
                : ""
            }`} />
      <ModalBody>
        <ModalField label="Name" htmlFor="save-session-name">
          <Input
            id="save-session-name"
            type="text"
            placeholder="e.g. Research"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) void handleSave()
            }}
          />
        </ModalField>

        <ModalField label="Save to">
          <DestinationPicker value={target} onChange={setTarget} />
          {/* The picker marks the chosen category itself; only say something when nothing is chosen. */}
          {!destination && !createsSpace && (
            <span className="text-fg-subtle text-xs font-sans" aria-live="polite">Pick or create a category to save into.</span>
          )}
        </ModalField>
      </ModalBody>
      <ModalFooter primary={{ label: saving ? "Saving…" : "Save group", disabled: !canSave || saving, onClick: () => void handleSave() }} />
    </Modal>
  )
}
