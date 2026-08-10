import { useCallback, useMemo, useState } from "react"
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~src/components/ui/select"
import { Input } from "~src/components/ui/input"
import { Label } from "~src/components/ui/label"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { isSavableTabUrl, saveTabsAsGroup } from "~src/services/saveTabsAsGroup"
import { resolveSaveTargetIds } from "~src/services/resolveSaveTarget"
import type { SaveTabsTarget } from "~src/services/saveTabsAsGroup"

type Named = { id: string; name: string }

function defaultSessionName() {
  const now = new Date()
  return `${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`
}

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

  const [name, setName] = useState(defaultSessionName)
  const [target, setTarget] = useState<SaveTabsTarget>(() =>
    resolveSaveTargetIds(savedSpaces, {
      spaceId: activeSpaceId,
      projectId: activeProjectId,
      categoryId: activeCategoryId,
    }),
  )
  const [saving, setSaving] = useState(false)
  /** Portal host for Select menus — keeps them inside the dialog pointer/stacking island. */
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null)

  const space = savedSpaces.find((s) => s.id === target.spaceId)
  const projects = space?.projects ?? []
  const project = projects.find((p) => p.id === target.projectId)
  const categories = project?.categories ?? []
  const category = categories.find((c) => c.id === target.categoryId)

  const savableTabs = useMemo(
    () => tabs.filter((t) => isSavableTabUrl(t.url)),
    [tabs],
  )
  const canSave =
    !!target.spaceId &&
    !!target.projectId &&
    !!target.categoryId &&
    !!name.trim() &&
    savableTabs.length > 0

  const destinationFields: {
    key: string
    label: string
    value: string
    options: Named[]
    emptyLabel: string
    selectedName?: string
    onChange: (id: string) => void
  }[] = [
    {
      key: "space",
      label: "Space",
      value: target.spaceId,
      options: savedSpaces,
      emptyLabel: savedSpaces.length === 0 ? "No spaces" : "Select a space",
      selectedName: space?.name,
      onChange: (spaceId) =>
        setTarget(resolveSaveTargetIds(savedSpaces, { spaceId })),
    },
    {
      key: "project",
      label: "Project",
      value: target.projectId,
      options: projects,
      emptyLabel: projects.length === 0 ? "No projects" : "Select a project",
      selectedName: project?.name,
      onChange: (projectId) =>
        setTarget(
          resolveSaveTargetIds(savedSpaces, {
            spaceId: target.spaceId,
            projectId,
          }),
        ),
    },
    {
      key: "category",
      label: "Category",
      value: target.categoryId,
      options: categories,
      emptyLabel: categories.length === 0 ? "No categories" : "Select a category",
      selectedName: category?.name,
      onChange: (categoryId) =>
        setTarget((t) => ({ ...t, categoryId })),
    },
  ]

  const handleSave = useCallback(async () => {
    if (!canSave) return
    setSaving(true)
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
      <DialogContent ref={setPortalHost} className="w-full max-w-md p-5">
        <DialogHeader>
          <DialogTitle className="text-white/90 font-sans text-base font-medium">
            Save Session
          </DialogTitle>
          <DialogDescription>
            {savableTabs.length === 0
              ? "No savable tabs in this window (chrome:// pages are skipped)."
              : `${savableTabs.length} tab${savableTabs.length === 1 ? "" : "s"} will be saved as a group.`}
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

          {destinationFields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label>{field.label}</Label>
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger disabled={field.options.length === 0}>
                  <SelectValue placeholder={field.emptyLabel}>
                    {field.selectedName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent container={portalHost}>
                  {field.options.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {(projects.length === 0 || categories.length === 0) && (
            <p className="text-white/40 text-xs font-sans">
              Create a project and category in the sidebar first, then save here.
            </p>
          )}
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
