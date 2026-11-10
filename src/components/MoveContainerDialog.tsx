import { useId, useState } from "react"
import { Modal, ModalBody, ModalFooter, ModalHeader } from "~src/components/ui/modal"
import { Input } from "~src/components/ui/input"
import { Choice } from "~src/components/DestinationPicker"
import { ProjectIcon, SpaceAvatar } from "~src/components/levelIcons"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"

import type { ContainerTarget } from "~src/services/moveTo"
export type { ContainerTarget }

/**
 * "Move to…" for a project or a category (TASK-59): the non-drag way to move a
 * container, keyboard-reachable from its ⋯ menu. Same dialog and row shape as
 * a group's "Move to…" (PickDestinationDialog); a project picks a space, a
 * category picks a project. The current place is listed, marked, and can't be
 * confirmed.
 */
export function MoveContainerDialog({ kind, name, current, onConfirm, onClose }: {
  kind: "project" | "category"
  name: string
  current: ContainerTarget
  onConfirm: (target: ContainerTarget) => void
  onClose: () => void
}) {
  const savedSpaces = useSavedSpacesStore((s) => s.savedSpaces)
  const activeSpaceId = useSavedSpacesStore((s) => s.activeSpaceId)
  const [target, setTarget] = useState<ContainerTarget>(current)
  const [query, setQuery] = useState("")
  const group = useId()
  const q = query.trim().toLowerCase()
  const hit = (s: string) => !q || s.toLowerCase().includes(q)

  // A project picks a space; a category picks a project (a space's name match keeps all its projects).
  const visible = savedSpaces
    .map((space) => ({ space, projects: kind === "project" || hit(space.name) ? space.projects : space.projects.filter((p) => hit(p.name)) }))
    .filter(({ space, projects }) => (kind === "project" ? hit(space.name) : projects.length > 0))

  const isCurrent = (t: ContainerTarget) => t.spaceId === current.spaceId && t.projectId === current.projectId
  const isPicked = (t: ContainerTarget) => t.spaceId === target.spaceId && t.projectId === target.projectId
  const here = <span className="text-[11px] text-fg-subtle">Current</span>
  const where = kind === "project" ? "space" : "project"

  return (
    <Modal kind="dialog" size="m" open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalHeader title={`Move ${kind}`} description={`Move “${name}” and everything in it to another ${where}.`} />
      <ModalBody>
        <div className="flex flex-col gap-2 min-w-0">
          <Input
            type="search"
            aria-label={`Find a ${where}`}
            placeholder={kind === "project" ? "Find a space…" : "Find a space or project…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full"
          />
          <div role="radiogroup" aria-label={`Destination ${where}`} className="max-h-60 overflow-y-auto rounded-md border border-ink/10 bg-ink/[0.02] py-1">
            {visible.length === 0 && <div className="px-3 py-3 text-xs text-fg-subtle">No match.</div>}
            {visible.map(({ space, projects }) => kind === "project" ? (
              <Choice
                key={space.id}
                name={group}
                indentClass="pl-3"
                selected={isPicked({ spaceId: space.id })}
                icon={<SpaceAvatar space={space} size={14} active={space.id === activeSpaceId} />}
                label={space.name}
                trailing={isCurrent({ spaceId: space.id }) ? here : undefined}
                onSelect={() => setTarget({ spaceId: space.id })}
              />
            ) : (
              <div key={space.id} className="py-0.5">
                <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-fg-muted">
                  <SpaceAvatar space={space} size={14} active={space.id === activeSpaceId} />
                  <span className="truncate">{space.name}</span>
                </div>
                {projects.map((project) => {
                  const t = { spaceId: space.id, projectId: project.id }
                  return (
                    <Choice
                      key={project.id}
                      name={group}
                      indentClass="pl-5"
                      selected={isPicked(t)}
                      icon={<ProjectIcon className="h-3.5 w-3.5 shrink-0" />}
                      label={project.name}
                      trailing={isCurrent(t) ? here : undefined}
                      onSelect={() => setTarget(t)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </ModalBody>
      <ModalFooter primary={{ label: `Move ${kind}`, disabled: isCurrent(target), onClick: () => { onConfirm(target); onClose() } }} />
    </Modal>
  )
}
