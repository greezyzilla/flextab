import { useMemo, useState } from "react"
import { Icon } from "~src/components/ui/icon"
import { ChevronRight } from "lucide-react"
import { useMergeConflict } from "~src/store/useMergeConflict"
import { resolveMergeConflicts, dismissMergeConflicts } from "~src/services/syncEngine"
import { merge3, type Conflict, type Resolutions } from "~src/services/spacesMerge3"
import { spaceTabCount } from "~src/services/spacesTree"
import { autoMerged, changeText, editSummary, LEVEL_LABEL, locate, locatedName, type Change, type Level } from "~src/services/syncChanges"
import { addAccountCopies, canKeepBoth } from "~src/services/keepBoth"
import { cn } from "~src/lib/utils"
import { GROUP_COLORS } from "~src/lib/groupColors"
import { Button } from "~src/components/ui/button"
import { Label } from "~src/components/ui/label"
import { RadioGroup, RadioGroupItem } from "~src/components/ui/radio-group"
import { Modal, ModalBody, ModalFooter, ModalHeader, ModalLink } from "~src/components/ui/modal"

type Side = "server" | "local"
/** A choice: one side, or both versions of a tab's address (TASK-29). */
type Choice = Side | "both"
const SIDE_NAME: Record<Side, string> = { local: "This device", server: "Your account" }
const SIDE_POSSESSIVE: Record<Side, string> = { local: "this device's", server: "your account's" }

const FIELD_LABEL: Record<string, string> = {
  name: "Name", title: "Title", url: "Address", favicon: "Icon", icon: "Icon", color: "Color", abbreviation: "Short name",
  location: "Place",
}
const shown = (v: unknown) => (v === undefined || v === null || v === "" ? "(empty)" : `“${String(v)}”`)
/** A group colour reads as its menu name (Red, None), not its stored id. */
const shownGroupColor = (v: unknown) => GROUP_COLORS.find((c) => c.id === v)?.label ?? "None"
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

interface Option { side: Choice; label: string; detail: string }

/** merge3 takes one side per conflict: "Keep both" resolves to this device,
 *  and the account's tab is added after (see keepBoth.ts). */
function split(choices: Record<string, Choice>, conflicts: Conflict[]) {
  const resolutions: Resolutions = Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, v === "both" ? "local" : v]))
  return { resolutions, keepBoth: conflicts.filter((c) => choices[c.key] === "both") }
}

/** What the user is choosing between, in plain words (TASK-29). */
function describe(c: Conflict, level: Level, base: ReturnType<typeof locate>): { lead: string; options: Option[] } {
  const what = LEVEL_LABEL[level].toLowerCase()
  if (c.kind === "field") {
    const field = FIELD_LABEL[c.field ?? ""] ?? c.field ?? "Value"
    const show = level === "group" && c.field === "color" ? shownGroupColor : shown
    const options: Option[] = [
      { side: "local", label: SIDE_NAME.local, detail: show(c.local) },
      { side: "server", label: SIDE_NAME.server, detail: show(c.server) },
    ]
    // Two addresses are two pages: both can stay, as two tabs.
    if (canKeepBoth(c, level)) options.push({ side: "both", label: "Keep both", detail: "Two tabs, one for each address" })
    return { lead: `${field} was ${show(c.base)}. Both sides changed it.`, options }
  }
  // Delete on one side, edit on the other: say who did what.
  const deleter: Side = c.deletedOn ?? "server"
  const keeper: Side = deleter === "server" ? "local" : "server"
  const edited = (keeper === "local" ? c.local : c.server) as Parameters<typeof editSummary>[1]
  const did = deleteEditSummary(c, base?.node, edited, level)
  return {
    lead: `${SIDE_NAME[deleter]} deleted this ${what}. ${SIDE_NAME[keeper]} ${did}.`,
    options: [
      { side: keeper, label: "Keep it", detail: `With ${SIDE_POSSESSIVE[keeper]} changes` },
      { side: deleter, label: "Delete it", detail: "Removed everywhere" },
    ],
  }
}

/** What the keeping side did, moves first (TASK-59): "moved it to Work", "moved “Test” into it". */
function deleteEditSummary(c: Conflict, baseNode: Parameters<typeof editSummary>[0], edited: Parameters<typeof editSummary>[1], level: Level): string {
  const edits = editSummary(baseNode, edited, level)
  const moves = [
    ...(c.movedTo ? [`moved it to ${c.movedTo}`] : []),
    ...(c.movedIn ? [`moved “${c.movedIn}” into it`] : []),
  ]
  if (!moves.length) return edits
  // An item moved in reads to editSummary as "added …": the move line already says it.
  if (c.movedIn || edits === "changed it") return moves.join(", ")
  return [...moves, edits].join(", ")
}

function MergedList({ title, changes }: { title: string; changes: Change[] }) {
  if (changes.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <div className="text-fg-muted text-xs font-medium">{title}</div>
      <ul className="flex flex-col gap-0.5">
        {changes.map((ch, i) => <li key={i} className="text-fg-subtle text-xs leading-relaxed">{changeText(ch)}</li>)}
      </ul>
    </div>
  )
}

// Shown when a 3-way reconcile finds true conflicts. Like a git merge: what
// merged by itself is listed, each conflict shows the base and both sides, and
// nothing is chosen for the user. Nothing is written until Apply. "Pause sync
// and decide later" keeps local data and pauses sync; the header sync indicator
// reopens it (TASK-10).
export function MergeConflictModal() {
  const { pending, conflicts, base, server, local } = useMergeConflict()
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [showMerged, setShowMerged] = useState(false)

  const merged = useMemo(() => autoMerged(base, server, local, conflicts), [base, server, local, conflicts])
  const mergedCount = merged.fromAccount.length + merged.fromDevice.length
  const items = useMemo(() => conflicts.map((c) => {
    // Name and path as they were at the common base: both sides may have renamed them.
    const loc = locate(c.id, base, local, server)
    const level: Level = loc?.level ?? "space"
    return { c, level, path: loc?.path ?? [], name: loc ? locatedName(loc) : c.name || "(untitled)", ...describe(c, level, locate(c.id, base)) }
  }), [conflicts, base, server, local])

  const chosen = conflicts.filter((c) => choices[c.key]).length
  const complete = conflicts.length > 0 && chosen === conflicts.length
  const resolvedCount = useMemo(() => {
    if (!complete) return 0
    const { resolutions, keepBoth } = split(choices, conflicts)
    return addAccountCopies(merge3(base, server, local, resolutions).merged, server, keepBoth).reduce((n, s) => n + spaceTabCount(s), 0)
  }, [complete, base, server, local, conflicts, choices])

  const choose = (key: string, side: Choice) => setChoices((prev) => ({ ...prev, [key]: side }))
  const chooseAll = (side: Side) => setChoices(Object.fromEntries(conflicts.map((c) => [c.key, side])))
  const reset = () => { setChoices({}); setShowMerged(false) }

  // A forced decision (modal standard §2): no Esc or outside path that would
  // pause sync by accident. Pausing is the explicit footer-start action;
  // resolving clears pending via the engine.
  return (
    <Modal kind="alert" size="l" open={pending} onOpenChange={() => {}} dismissible={false}>
      <ModalHeader title="Resolve sync conflicts"
        description={`${plural(conflicts.length, "item")} changed on both this device and your account. Choose a version for each. Nothing changes until you apply.`} />

      {mergedCount > 0 && (
        <div className="shrink-0">
          <button
            type="button"
            aria-expanded={showMerged}
            onClick={() => setShowMerged((v) => !v)}
            className="flex items-center gap-1.5 rounded text-fg-muted text-xs outline-none hover:text-fg focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon icon={ChevronRight} size="sm" className={cn("transition-transform", showMerged && "rotate-90")} />
            {plural(mergedCount, "other change")} merged automatically
          </button>
          {showMerged && (
            <div className="mt-2 flex max-h-40 flex-col gap-3 overflow-y-auto rounded-lg border border-ink/10 bg-ink/[0.02] px-3 py-2.5">
              <MergedList title="From your account, arriving on this device" changes={merged.fromAccount} />
              <MergedList title="From this device, going to your account" changes={merged.fromDevice} />
            </div>
          )}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 text-fg-subtle text-xs">
        {conflicts.length > 1 && (
          <>
            <span>Choose for all:</span>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => chooseAll("local")}>This device</Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => chooseAll("server")}>Your account</Button>
          </>
        )}
        <span className="ml-auto" aria-live="polite">
          {complete ? `${plural(resolvedCount, "tab")} after apply` : `${chosen} of ${conflicts.length} chosen`}
        </span>
      </div>

      {/* The list is the scroll area; hairlines mark its edges while it scrolls (§3). */}
      <ModalBody>
        <div className="flex min-h-[100px] flex-col gap-3">
          {items.map(({ c, level, path, name, lead, options }) => (
            <section key={c.key} aria-label={`${LEVEL_LABEL[level]} ${name}`} className="flex flex-col gap-2 rounded-lg border border-ink/10 p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-fg-subtle text-[11px] uppercase tracking-wide">{LEVEL_LABEL[level]}</span>
                  <span className="truncate text-fg text-sm">{name}</span>
                </div>
                {path.length > 0 && <span className="truncate text-fg-subtle text-[11px]">in {path.join(" › ")}</span>}
              </div>
              <p className="text-fg-muted text-xs leading-relaxed">{lead}</p>
              <RadioGroup
                value={choices[c.key] ?? ""}
                onValueChange={(v) => choose(c.key, v as Choice)}
                aria-label={`${LEVEL_LABEL[level]} ${name}: which version to keep`}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {options.map((opt) => {
                  const id = `merge-${c.key}-${opt.side}`
                  return (
                    <Label
                      key={opt.side}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 font-normal transition-colors",
                        opt.side === "both" && "sm:col-span-2",
                        choices[c.key] === opt.side ? "border-[var(--accent)] bg-[var(--accent-subtle)]" : "border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]",
                      )}
                    >
                      <RadioGroupItem value={opt.side} id={id} className="mt-0.5" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-fg text-xs font-medium">{opt.label}</span>
                        <span className="break-all text-fg-subtle text-xs">{opt.detail}</span>
                      </span>
                    </Label>
                  )
                })}
              </RadioGroup>
            </section>
          ))}
        </div>
      </ModalBody>

      <ModalFooter
        start={<ModalLink onClick={() => { dismissMergeConflicts(); reset() }}>Pause sync and decide later</ModalLink>}
        primary={{
          label: "Resolve conflicts",
          disabled: !complete,
          onClick: () => {
            const { resolutions, keepBoth } = split(choices, conflicts)
            resolveMergeConflicts(resolutions, keepBoth.map((c) => c.key))
            reset()
          },
        }} />
    </Modal>
  )
}
