import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode } from "react"
import { describeAlsoSaved } from "~src/lib/savedUrlIndex"
import { WorkspaceLoadError } from "~src/components/WorkspaceLoadError"
import "@fontsource-variable/inter"
import "../../style.css"
import { useSavedSpacesStore, useHydrated } from "~src/store/useSavedSpacesStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { applyThemeMode, readStoredThemeMode } from "~src/lib/theme"
import { installExternalPersistBridge } from "~src/lib/yjsDoc"
import { FaviconImg } from "~src/components/FaviconImg"
import { cn } from "~src/lib/utils"
import { Ban, BookmarkPlus, Check, CopyPlus, FolderInput, ListX, Replace, RotateCw, Undo2 } from "lucide-react"
import { CategoryIcon, GroupIcon, ProjectIcon, SpaceAvatar, UnsortedIcon } from "~src/components/levelIcons"
import { isUnsortedGroup } from "~src/lib/defaultPath"
import { DestinationPicker, describeDestination, type PickerValue } from "~src/components/DestinationPicker"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import * as yjs from "~src/lib/yjsDoc"
import { normalizeUrl } from "~src/lib/savedUrlIndex"
import { bestSameHostMatch, findLinkedTab, getOpenLink, noteJustUpdated, restoreLinkedTab, continuationTabs, updateLinkedTab, type OpenLink } from "~src/services/openLinks"
import { describeChange, type Change } from "~src/lib/describeChange"
import type { SavedGroup, SavedSpace, SavedTab } from "~src/types"
import {
  captureTabs, moveCapture, undoCapture, persistCapture, isCaptureFailure, closeSavedTabs,
  loadDefaultDestination, loadCloseAfter, POPUP_CLOSE_PORT,
  type CaptureReceipt, type CaptureFailure, type CaptureDestination,
} from "~src/services/capture"

// Before the first render: a forced Light/Dark must not flash (lib/theme.ts).
applyThemeMode(readStoredThemeMode())

/**
 * The popup is a quick-access panel for the tab it was opened on (TASK-2,
 * TASK-72). One shape for every state: the tab's favicon as a tile, one
 * sentence saying what happened to it, the place it lives spelled out one
 * level per row, then a single box of short actions. Every state belongs to
 * one journey and Undo ends it.
 *
 * The tab is saved the moment the popup opens (no save gains a mandatory
 * step), or, when it continues a saved show, that saved tab is moved to this
 * episode in place. The window's other tabs can join the same group below.
 * The page you are on is never closed (that would close the popup).
 */
type Status =
  | { kind: "saving" }
  // A saved tab this page continues was pointed at it: opened from that card
  // ("linked"), or the one clear same-site match ("match").
  | { kind: "updated"; link: OpenLink; before: SavedTab; change: Change; reason: "linked" | "match" }
  | { kind: "reverted"; link: OpenLink; before: SavedTab; change: Change; reason: "linked" | "match" }
  | { kind: "saved"; receipt: CaptureReceipt }
  | { kind: "already"; destination: CaptureDestination }
  | { kind: "unsavable" }
  | { kind: "choose" }
  | { kind: "removed" }
  | { kind: "failed"; receipt: CaptureReceipt }
  | { kind: "error"; message: string }

const toDestination = (r: CaptureReceipt): CaptureDestination => ({ ...r.target })
const destinationOf = (l: OpenLink): CaptureDestination => ({ spaceId: l.spaceId, projectId: l.projectId, categoryId: l.categoryId, groupId: l.groupId })
const pageOf = (t: chrome.tabs.Tab) => t as { title?: string; url?: string }

function IndexPopup() {
  const { hydrated, error: hydrationError } = useHydrated()
  const { initialize, isLoading: authLoading } = useAuthStore()
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore()
  // The workspace is always local and usable once hydrated (TASK-7).
  const usable = hydrated

  const [status, setStatus] = useState<Status>({ kind: "saving" })
  const [destination, setDestination] = useState<CaptureDestination | null>(null)
  const [picking, setPicking] = useState(false)
  const headingRef = useRef<HTMLParagraphElement>(null)
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null)
  const [others, setOthers] = useState<chrome.tabs.Tab[]>([])
  const [windowReceipt, setWindowReceipt] = useState<CaptureReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  // Settings › Saving: "Close after saving from the popup".
  // Read before the first frame, so "closes when you close this panel" doesn't pop in later.
  const [closeAfter, setCloseAfter] = useState<boolean | null>(null)
  useEffect(() => { void loadCloseAfter("popup").then(setCloseAfter) }, [])
  const closePort = useRef<chrome.runtime.Port | null>(null)
  // The window's tabs, read once before anything is drawn: the first frame
  // already has every card it will have.
  const [tabsRead, setTabsRead] = useState<{ current: chrome.tabs.Tab | null; failed?: boolean } | null>(null)

  useEffect(() => { initialize() }, [])
  useEffect(() => { if (hydrated) installExternalPersistBridge() }, [hydrated])
  useEffect(() => {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true })
        const current = tabs.find((t) => t.active) ?? null
        setCurrentTab(current)
        setOthers(tabs.filter((t) => t !== current && isSavableTabUrl(t.url)))
        setTabsRead({ current })
      } catch (_) {
        setTabsRead({ current: null, failed: true })
      }
    })()
  }, [])

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

  // Point a saved tab at this page in place (id, position, group kept).
  const applyUpdate = useCallback(async (page: chrome.tabs.Tab, link: OpenLink, reason: "linked" | "match", takeBack?: CaptureReceipt) => {
    if (takeBack) await undoCapture(takeBack)
    const before = await updateLinkedTab(link, page)
    if (!before) return
    await persistCapture()
    void noteJustUpdated(link.tabId) // the dashboard outlines it when you get back
    setDestination(destinationOf(link))
    setStatus({ kind: "updated", link, before, change: describeChange(before, pageOf(page)), reason })
  }, [])

  // Act on this page as soon as the popup opens.
  useEffect(() => {
    if (!usable || !tabsRead || started.current) return
    started.current = true
    void (async () => {
      try {
        if (tabsRead.failed) throw new Error("tabs")
        const current = tabsRead.current
        const dest = await loadDefaultDestination({ spaceId: activeSpaceId, projectId: activeProjectId, categoryId: activeCategoryId })
        if (!current || !isSavableTabUrl(current.url)) {
          setDestination(dest) // the window's tabs can still be saved
          setStatus({ kind: "unsavable" })
          return
        }
        const link = await getOpenLink(current.id)
        const card = link ? findLinkedTab(yjs.getSpaces(), link) : null
        if (link && card && normalizeUrl(card.url) !== normalizeUrl(current.url)) {
          await applyUpdate(current, link, "linked")
          return
        }
        const match = bestSameHostMatch(yjs.getSpaces(), current.url)
        if (match) {
          await applyUpdate(current, match.link, "match")
          return
        }
        showCapture(await captureTabs([current], dest, { dedupe: true }), dest)
      } catch (_) {
        setStatus({ kind: "error", message: "Could not read your tabs. Please try again." })
      }
    })()
  }, [usable, tabsRead])

  // The page this popup saved closes when the popup does (closing it now would
  // close the popup and its Undo). Undo, or anything that leaves it unsaved, clears it.
  useEffect(() => {
    const close = closeAfter && (status.kind === "saved" || status.kind === "updated") ? currentTab?.id ?? null : null
    if (close === null && !closePort.current) return
    try {
      closePort.current ??= chrome.runtime.connect({ name: POPUP_CLOSE_PORT })
      closePort.current.postMessage({ close })
    } catch (_) { /* no background to tell: the page stays open */ }
  }, [closeAfter, status.kind, currentTab])

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try { await work() } finally { setBusy(false) }
  }

  const pickDestination = (picked: PickerValue) => run(async () => {
    setPicking(false)
    const dest: CaptureDestination = { ...picked }
    if (status.kind === "saved") showCapture(await moveCapture(status.receipt, dest), dest)
    else if (currentTab) showCapture(await captureTabs([currentTab], dest, { dedupe: true }), dest)
    else setDestination(dest)
  })

  const undo = () => run(async () => {
    if (status.kind !== "saved") return
    await undoCapture(status.receipt)
    setPicking(false)
    setStatus({ kind: "removed" })
  })

  const updateTo = (link: OpenLink, reason: "linked" | "match", takeBack?: CaptureReceipt) => run(async () => {
    if (currentTab) await applyUpdate(currentTab, link, reason, takeBack)
  })

  const undoUpdate = () => run(async () => {
    if (status.kind !== "updated") return
    restoreLinkedTab(status.link, status.before)
    await persistCapture()
    setPicking(false)
    setDestination(destinationOf(status.link))
    setStatus({ ...status, kind: "reverted" })
  })

  // Keep the saved tab as it was and save this page next to it instead.
  const saveAsNew = () => run(async () => {
    if (status.kind !== "updated" || !currentTab) return
    restoreLinkedTab(status.link, status.before)
    const dest = destinationOf(status.link)
    showCapture(await captureTabs([currentTab], dest, { dedupe: true }), dest)
  })

  // Not saved (after Undo): save it where it was going after all.
  const saveHere = () => run(async () => {
    if (!currentTab) return
    const dest = status.kind === "reverted" ? destinationOf(status.link) : destination
    if (!dest) return
    showCapture(await captureTabs([currentTab], dest, { dedupe: true }), dest)
  })

  // A heading that wraps steps down a size so two lines still fit the tile.
  useLayoutEffect(() => {
    const el = headingRef.current
    if (!el) return
    delete el.dataset.lines
    if (el.scrollHeight > 26) el.dataset.lines = "2"
  })

  const retry = () => run(async () => {
    if (status.kind !== "failed") return
    if (await persistCapture()) setStatus({ kind: "saved", receipt: { ...status.receipt, persisted: true } })
  })

  // This window: the other tabs join the same group as this page.
  const saveWindow = (close: boolean) => run(async () => {
    const dest = destination ?? await loadDefaultDestination({ spaceId: activeSpaceId, projectId: activeProjectId, categoryId: activeCategoryId })
    const result = await captureTabs(others, dest, { dedupe: true })
    if (isCaptureFailure(result)) return
    const closed = close ? await closeSavedTabs(others) : []
    setWindowReceipt({ ...result, closed })
  })

  const undoWindow = () => run(async () => {
    if (!windowReceipt) return
    await undoCapture(windowReceipt) // reopens the tabs it closed
    setWindowReceipt(null)
  })

  if (hydrationError) return <div className="w-72"><WorkspaceLoadError /></div>
  if (!tabsRead || closeAfter === null) return null
  const loading = authLoading || !hydrated

  const place = placeOf(savedSpaces, destination)
  // Two or more equally likely saved episodes: the page was saved; offer the
  // nearest one first and the rest as small chips.
  const continues = status.kind === "saved" && currentTab ? continuationTabs(savedSpaces, currentTab.url) : []
  const offers = continues.length >= 2 && currentTab ? rankContinuations(continues, currentTab) : []
  const alsoSaved = status.kind === "saved" ? describeAlsoSaved(status.receipt.alsoIn ?? []) : null

  const ok = !loading && (status.kind === "saved" || status.kind === "already" || status.kind === "updated")
  const tile = status.kind === "unsavable"
    ? <Ban className="h-[22px] w-[22px] text-fg-subtle" strokeWidth={1.75} aria-hidden />
    : currentTab && <FaviconImg src={currentTab.favIconUrl} alt="" className="h-[22px] w-[22px]" />

  const lead = (t: string) => <span className="font-medium text-fg-muted">{t}</span>
  const groupName = <bdi title={place.path ?? undefined}>{place.group?.name}</bdi>
  const heading: ReactNode = loading ? lead("Loading…") : (() => {
    switch (status.kind) {
      case "saving": return lead("Saving…")
      case "saved": return <>{lead("Saved to ")}{groupName}</>
      case "already": return <>{lead("Already in ")}{groupName}</>
      case "updated": return <><span className="sr-only">Updated: </span>{lead(status.change.name ? "Updated to " : "Updated in ")}<bdi>{status.change.name ? status.change.to : place.group?.name}</bdi></>
      case "reverted": case "removed": return lead("Not saved")
      case "choose": return lead("Not saved yet")
      case "failed": return <span role="alert">Could not save this tab</span>
      case "unsavable": return lead("This page can't be saved")
      case "error": return <span role="alert">Could not read your tabs</span>
    }
  })()
  const sub: ReactNode =
    loading ? null
    : status.kind === "updated" && status.change.name ? <>was <bdi>{status.change.from}</bdi>{closeAfter ? " · closes when you close this panel" : ""}</>
    : status.kind === "saved" && closeAfter ? "Closes when you close this panel."
    : status.kind === "reverted" ? <>Undone. The saved tab is back on <bdi>{status.change.name ? status.change.from : "its old page"}</bdi>.</>
    : status.kind === "removed" ? "Undone. This tab is not in FlexTab."
    : status.kind === "choose" ? "Pick a group for this tab"
    : status.kind === "failed" ? <span className="text-danger">Your browser refused to store it</span>
    : status.kind === "unsavable" ? "Browser pages stay out of FlexTab"
    : status.kind === "error" ? "Close and reopen this panel to try again"
    : null

  // Where the tab lives, one level per row. The group gets its row unless the
  // heading already names it.
  const where: { caption?: string; withGroup: boolean } | null =
    loading ? null
    : status.kind === "saved" || status.kind === "already" ? { withGroup: false }
    : status.kind === "updated" ? { withGroup: true }
    : status.kind === "removed" || status.kind === "reverted" ? { caption: "Save it to", withGroup: true }
    : status.kind === "failed" ? { caption: "It was going to", withGroup: true }
    : null

  const steps: Step[] =
    loading ? []
    : status.kind === "saved" ? [
      ...(offers.length ? [{ icon: Replace, label: `Update ${offers[0].label} instead`, onClick: () => updateTo(offers[0].link, "match", status.receipt) }] : []),
      { icon: FolderInput, label: "Move to another group", onClick: () => setPicking((p) => !p), expanded: picking },
      { icon: Undo2, label: "Undo", onClick: undo },
    ]
    : status.kind === "already" ? [{ icon: CopyPlus, label: "Save a copy in another group", onClick: () => setPicking((p) => !p), expanded: picking }]
    : status.kind === "updated" ? [
      { icon: CopyPlus, label: status.change.name ? `Keep ${status.change.from}, save as new` : "Keep the saved tab, save as new", onClick: saveAsNew },
      { icon: Undo2, label: "Undo", onClick: undoUpdate },
    ]
    : status.kind === "removed" || status.kind === "reverted" ? [
      { icon: BookmarkPlus, label: "Save here", onClick: saveHere },
      { icon: FolderInput, label: "Save to another group", onClick: () => setPicking((p) => !p), expanded: picking },
    ]
    : status.kind === "choose" ? [{ icon: FolderInput, label: "Choose a group", onClick: () => setPicking((p) => !p), expanded: picking }]
    : status.kind === "failed" ? [{ icon: RotateCw, label: "Try again", onClick: retry }]
    : []

  const word = offers.length ? offers[0].word : "tab"
  const n = others.length
  const windowGroup = windowReceipt ? placeOf(savedSpaces, toDestination(windowReceipt)).group?.name : null
  const saved = windowReceipt?.tabIds.length ?? 0
  const closed = windowReceipt?.closed.length ?? 0
  // "The same group" only reads when the page's place is on screen above.
  const windowTarget = where && place.space ? "the same group" : place.group?.name ?? place.category?.name

  return (
    <main className="flex w-80 flex-col gap-3.5 bg-black-900 p-4 font-sans text-fg">
      <h1 className="sr-only">FlexTab</h1>
      <section data-card="page" role="status" aria-live="polite" className="flex flex-col gap-3.5">
        <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3">
          <span className="relative grid h-11 w-11 place-items-center rounded-[13px] bg-ink/[0.06]">
            {tile}
            {ok && <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-success ring-2 ring-black-900"><Check className="h-[11px] w-[11px] text-black-900" strokeWidth={3.5} aria-hidden /></span>}
          </span>
          <div className="min-w-0">
            <p ref={headingRef} data-slot="page-sentence" className="line-clamp-2 text-[19px] font-semibold leading-6 text-fg [overflow-wrap:anywhere] data-[lines=2]:text-[15px] data-[lines=2]:leading-5">{heading}</p>
            {sub && <p data-slot="page-detail" className="mt-0.5 text-[13px] leading-[18px] text-fg-subtle [overflow-wrap:anywhere]">{sub}</p>}
          </div>
        </div>
        {/* While picking, the picker is the task: the place, the episode
            chips and the window part step aside so it sits under its row. */}
        {where && place.space && !picking && (
          <>
            {where.caption && <p className="-mb-1.5 text-[13px] leading-[18px] text-fg-subtle">{where.caption}</p>}
            <Location place={place} withGroup={where.withGroup} />
          </>
        )}
        {steps.length > 0 && <Steps steps={steps} disabled={busy} />}
        {picking && (
          <DestinationPicker
            groupLevel
            size="panel"
            value={destination ?? { spaceId: activeSpaceId ?? "", projectId: activeProjectId ?? "", categoryId: activeCategoryId ?? "" }}
            onChange={pickDestination}
            maxHeightClass="max-h-[216px]"
          />
        )}
        {offers.length > 1 && !picking && (
          <>
            <p className="-mb-1.5 text-[13px] leading-[18px] text-fg-subtle">Or update another saved {word}</p>
            <ul aria-label="Other saved tabs this page continues" className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5">
              {offers.slice(1).map((o) => (
                <li key={o.tab.id} className="min-w-0">
                  <button type="button" disabled={busy} onClick={() => status.kind === "saved" && updateTo(o.link, "match", status.receipt)}
                    aria-label={`Update ${o.label} instead`} title={o.tab.title}
                    className="h-9 w-full truncate rounded-[10px] bg-ink/[0.06] px-2 text-[15px] text-fg outline-none transition-colors hover:bg-ink/[0.1] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                    {o.chip}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {alsoSaved && !picking && <p className="-mt-1.5 text-[13px] leading-[18px] text-fg-subtle [overflow-wrap:anywhere]">{alsoSaved}</p>}
      </section>
      {n > 0 && !loading && !picking && (
        <section aria-label="This window" className="flex flex-col gap-3.5 border-t border-ink/[0.08] pt-3.5">
          <p className="-mb-1.5 text-[13px] leading-[18px] text-fg-subtle [overflow-wrap:anywhere]">
            {!windowReceipt ? <>This window · {n} other tab{n === 1 ? "" : "s"}</>
              : saved ? <>Saved {saved} tab{saved === 1 ? "" : "s"} to <bdi>{windowGroup}</bdi>{closed ? ` · ${closed} closed` : ""}</>
              : <>Already in <bdi>{windowGroup}</bdi>{closed ? ` · ${closed} closed` : ""}</>}
          </p>
          {/* One way, as Settings › Saving says: saved, or saved and closed. */}
          <Steps disabled={busy} steps={!windowReceipt ? [
            closeAfter
              ? { icon: ListX, label: "Save and close them", onClick: () => saveWindow(true) }
              : { icon: BookmarkPlus, label: windowTarget ? `Save them to ${windowTarget}` : "Save them", onClick: () => saveWindow(false) },
          ] : [
            // Not a second bare "Undo" next to the page's own.
            ...(saved ? [{ icon: Undo2, label: closed ? `Undo, reopen ${closed} tab${closed === 1 ? "" : "s"}` : "Undo saving them", onClick: undoWindow }] : []),
          ]} />
        </section>
      )}
    </main>
  )
}

type Step = { icon: typeof Undo2; label: string; onClick: () => void; expanded?: boolean; name?: string }

/** The panel's actions: one box of full-width rows, an icon and a short label each. */
function Steps({ steps, disabled }: { steps: Step[]; disabled: boolean }) {
  if (steps.length === 0) return null
  return (
    <div className="overflow-hidden rounded-[14px] bg-ink/[0.04]">
      {steps.map(({ icon: Icon, label, onClick, expanded, name }) => (
        <button key={label} type="button" onClick={onClick} disabled={disabled} aria-expanded={expanded} aria-label={name}
          className={cn("grid min-h-11 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 px-3 py-[11px] text-left text-[15px] leading-[22px] text-fg outline-none transition-colors [overflow-wrap:anywhere] [&+&]:border-t [&+&]:border-ink/[0.07] hover:bg-ink/[0.05] focus-visible:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
            expanded && "bg-ink/[0.07]")}>
          <Icon className="h-5 w-5 text-fg-muted" strokeWidth={1.75} aria-hidden />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

type Place = { path: string | null; space?: SavedSpace; project?: { name: string }; category?: { name: string }; group?: SavedGroup }

function placeOf(spaces: SavedSpace[], d: CaptureDestination | null): Place {
  if (!d) return { path: null }
  const space = spaces.find((s) => s.id === d.spaceId)
  const project = space?.projects.find((p) => p.id === d.projectId)
  const category = project?.categories.find((c) => c.id === d.categoryId)
  const group = d.groupId ? category?.groups.find((g) => g.id === d.groupId) : undefined
  return { path: describeDestination(spaces, d), space, project, category, group }
}

/** Where the tab lives, one level per row at body size, each with its level's icon. */
function Location({ place, withGroup }: { place: Place; withGroup: boolean }) {
  const icon = "h-[18px] w-[18px] text-fg-subtle"
  const rows: Array<[ReactNode, string | undefined]> = [
    [<SpaceAvatar key="s" space={place.space} size={18} />, place.space?.name],
    [<ProjectIcon key="p" className={icon} />, place.project?.name],
    [<CategoryIcon key="c" className={icon} />, place.category?.name],
    ...(withGroup && place.group ? [[isUnsortedGroup(place.group) ? <UnsortedIcon key="g" className={icon} /> : <GroupIcon key="g" className={icon} />, place.group.name] as [ReactNode, string]] : []),
  ]
  return (
    <div aria-label={place.path ?? undefined} className="flex flex-col rounded-[14px] border border-ink/[0.09] px-[11px] py-1.5">
      {rows.filter(([, name]) => name).map(([glyph, name]) => (
        <div key={name + String((glyph as { key?: string }).key)} className="grid min-h-[30px] grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 text-[15px] leading-[22px] text-fg-muted">
          <span className="flex justify-center">{glyph}</span>
          <bdi className="truncate" title={name}>{name}</bdi>
        </div>
      ))}
    </div>
  )
}

const SHORT: Record<string, string> = { episode: "Ep", chapter: "Ch", volume: "Vol", part: "Pt", season: "S" }
const lastNumber = (s: string) => { const m = s.replace(/(\d),(\d)/g, "$1$2").match(/(\d+(?:\.\d+)?)(?!.*\d)/); return m ? Number(m[1]) : NaN }

/**
 * The saved tabs this page may continue, nearest first: the highest numbered
 * one below the page's own (Episode 12 for Episode 13), then the rest in
 * number order, each with the label that tells it apart ("Episode 12") and
 * a short chip form ("Ep 12").
 */
function rankContinuations(hits: Array<{ link: OpenLink; tab: SavedTab }>, page: chrome.tabs.Tab) {
  const items = hits.map(({ link, tab }) => {
    const c = describeChange(tab, pageOf(page))
    const label = c.name ? c.from : tab.title
    const m = label.match(/^(\p{L}+)\s+(.+)$/u)
    const short = m && SHORT[m[1].toLowerCase()]
    return { link, tab, label, chip: short ? `${short} ${m![2]}` : label, word: m && short ? m[1].toLowerCase() : "tab", n: lastNumber(label), to: lastNumber(c.to) }
  })
  const byNumber = [...items].sort((a, b) => (isNaN(a.n) || isNaN(b.n) ? 0 : a.n - b.n))
  const below = byNumber.filter((i) => !isNaN(i.n) && !isNaN(i.to) && i.n < i.to)
  const first = below.length ? below[below.length - 1] : items[0]
  return [first, ...byNumber.filter((i) => i !== first)]
}

export default IndexPopup
