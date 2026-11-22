import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode } from "react"
import { Icon } from "~src/components/ui/icon"
import { describeAlsoSaved, savedElsewhere, type SavedLocation } from "~src/lib/savedUrlIndex"
import { WorkspaceLoadError } from "~src/components/WorkspaceLoadError"
import "@fontsource-variable/inter"
import "../../style.css"
import { useSavedSpacesStore, useHydrated } from "~src/store/useSavedSpacesStore"
import { useAuthStore } from "~src/store/useAuthStore"
import { applyThemeMode, readStoredThemeMode } from "~src/lib/theme"
import { installExternalPersistBridge } from "~src/lib/yjsDoc"
import { FaviconImg } from "~src/components/FaviconImg"
import { ClippedTooltip, IconTooltip } from "~src/components/ui/button"
import { TooltipProvider } from "~src/components/ui/tooltip"
import { AppWindow, Ban, BookmarkPlus, Check, CopyPlus, FolderInput, ListX, Replace, RotateCw, Undo2, type LucideIcon } from "lucide-react"
import { CategoryIcon, GroupIcon, ProjectIcon, SpaceAvatar, UnsortedIcon } from "~src/components/levelIcons"
import { DEFAULT_CATEGORY_NAME, DEFAULT_PROJECT_NAME, DEFAULT_SPACE_NAME, UNSORTED_NAME, findUnsorted, isUnsortedGroup } from "~src/lib/defaultPath"
import { DestinationPicker, type PickerValue } from "~src/components/DestinationPicker"
import { isSavableTabUrl } from "~src/services/saveTabsAsGroup"
import * as yjs from "~src/lib/yjsDoc"
import { normalizeUrl } from "~src/lib/savedUrlIndex"
import { bestSameHostMatch, findLinkedTab, getOpenLink, noteJustUpdated, restoreLinkedTab, continuationTabs, updateLinkedTab, type OpenLink } from "~src/services/openLinks"
import { describeChange, type Change } from "~src/lib/describeChange"
import { openInFlexTab } from "~src/services/reveal"
import type { SavedSpace, SavedTab } from "~src/types"
import { Chip } from "~src/components/ui/chip"
import { ActionList, ActionRow } from "~src/components/ui/action-row"
import {
  captureTabs, moveCapture, undoCapture, persistCapture, isCaptureFailure, closeSavedTabs,
  loadSuggestedDestination, loadCloseAfter, POPUP_CLOSE_PORT, POPUP_SUBJECT_KEY, POPUP_SUBJECT_TTL_MS,
  type CaptureReceipt, type DestinationSource, type CaptureFailure, type CaptureDestination,
} from "~src/services/capture"

// Before the first render: a forced Light/Dark must not flash (lib/theme.ts).
applyThemeMode(readStoredThemeMode())

/**
 * The popup is a widget for the tab it was opened on (TASK-2, TASK-72,
 * TASK-75). One shape for every state: the tab's favicon as a tile, one
 * sentence saying where the page stands, the place spelled out one level per
 * row, then a single box of short actions.
 *
 * Opening it writes nothing. It shows the page's state (not saved yet and
 * where it would go, already saved and where, or a saved tab it continues)
 * and the first action names exactly what it will do ("Save to Reading",
 * "Update Episode 12 to Episode 13"). Choosing another group or another saved
 * episode only changes what is shown; saving is always its own click, so you
 * know which one you picked. Every save or update can be undone here.
 * The window's other tabs can join the same group below.
 * The page you are on is never closed (that would close the popup).
 */
type Offer = ReturnType<typeof rankContinuations>[number]
type Status =
  | { kind: "reading" }
  // Before any action: not saved yet (`copy`: a copy of a page saved elsewhere).
  | { kind: "ready"; copy?: boolean }
  // Before any action: this page is already saved, at these places.
  | { kind: "known"; locations: SavedLocation[] }
  // Before any action: saved tabs this page continues; `selected` is the one Update acts on.
  | { kind: "offer"; offers: Offer[]; selected: number; reason: "linked" | "match" }
  // A saved tab this page continues was pointed at it: opened from that card
  // ("linked"), or a same-site match ("match").
  | { kind: "updated"; link: OpenLink; before: SavedTab; change: Change; reason: "linked" | "match" }
  | { kind: "reverted"; link: OpenLink; before: SavedTab; change: Change; reason: "linked" | "match" }
  | { kind: "saved"; receipt: CaptureReceipt }
  | { kind: "already"; destination: CaptureDestination }
  | { kind: "unsavable" }
  | { kind: "removed" }
  | { kind: "failed"; receipt: CaptureReceipt }
  | { kind: "error"; message: string }

const toDestination = (r: CaptureReceipt): CaptureDestination => ({ ...r.target })
const destinationOf = (l: { spaceId: string; projectId: string; categoryId: string; groupId: string }): CaptureDestination => ({ spaceId: l.spaceId, projectId: l.projectId, categoryId: l.categoryId, groupId: l.groupId })
const pageOf = (t: chrome.tabs.Tab) => t as { title?: string; url?: string }

function IndexPopup() {
  const { hydrated, error: hydrationError } = useHydrated()
  const { initialize, isLoading: authLoading } = useAuthStore()
  const { savedSpaces, activeSpaceId, activeProjectId, activeCategoryId } = useSavedSpacesStore()
  // The workspace is always local and usable once hydrated (TASK-7).
  const usable = hydrated

  const [status, setStatus] = useState<Status>({ kind: "reading" })
  const [destination, setDestination] = useState<CaptureDestination | null>(null)
  // Why the shown place was suggested, said as the person would ("Last saved
  // to"); null once they pick one themselves.
  const [suggested, setSuggested] = useState<DestinationSource | null>(null)
  const [picking, setPicking] = useState(false)
  // The window's other tabs can be sent somewhere of their own; until then
  // they follow the page's place ("the same group").
  const [windowDest, setWindowDest] = useState<CaptureDestination | null>(null)
  const [windowPicking, setWindowPicking] = useState(false)
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
        // A link handed over by the right-click menu is what this popup is about.
        const handed = (await chrome.storage.session.get(POPUP_SUBJECT_KEY).catch(() => ({})) as Record<string, { url?: string; title?: string; at?: number } | undefined>)[POPUP_SUBJECT_KEY]
        const link = handed?.url && Date.now() - (handed.at ?? 0) < POPUP_SUBJECT_TTL_MS ? { url: handed.url, title: handed.title } as chrome.tabs.Tab : null
        if (handed) void chrome.storage.session.remove(POPUP_SUBJECT_KEY).catch(() => {})
        const current = link ?? tabs.find((t) => t.active) ?? null
        setCurrentTab(current)
        setOthers(link ? [] : tabs.filter((t) => t !== current && isSavableTabUrl(t.url)))
        setTabsRead({ current })
      } catch (_) {
        setTabsRead({ current: null, failed: true })
      }
    })()
  }, [])

  const showCapture = useCallback((result: CaptureReceipt | CaptureFailure, dest: CaptureDestination) => {
    if (isCaptureFailure(result)) {
      setStatus(result.error === "nothing-savable" ? { kind: "unsavable" } : { kind: "ready" })
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

  // Read where this page stands as soon as the popup opens. Nothing is written.
  useEffect(() => {
    if (!usable || !tabsRead || started.current) return
    started.current = true
    void (async () => {
      try {
        if (tabsRead.failed) throw new Error("tabs")
        const current = tabsRead.current
        // Only a place you saved to before is suggested. With none, nothing is
        // named: picking a group is the first step.
        const suggestion = await loadSuggestedDestination({ spaceId: activeSpaceId, projectId: activeProjectId, categoryId: activeCategoryId })
        // An empty workspace has nothing to pick from: its one way is the new
        // default space, named before saving (TASK-37).
        const named = suggestion.from === "recentGroup" || suggestion.from === "recentCategory" || yjs.getSpaces().length === 0
        const dest = named ? suggestion.destination : null
        setDestination(dest) // also where the window's tabs would go
        setSuggested(named ? suggestion.from : null)
        if (!current || !isSavableTabUrl(current.url)) {
          setStatus({ kind: "unsavable" })
          return
        }
        const spaces = yjs.getSpaces()
        const offer = (hits: Array<{ link: OpenLink; tab: SavedTab }>, reason: "linked" | "match") => {
          const offers = rankContinuations(hits, current)
          setDestination(destinationOf(offers[0].link))
          setStatus({ kind: "offer", offers, selected: 0, reason })
        }
        const link = await getOpenLink(current.id)
        const card = link ? findLinkedTab(spaces, link) : null
        if (link && card && normalizeUrl(card.url) !== normalizeUrl(current.url)) return offer([{ link, tab: card }], "linked")
        const locations = savedElsewhere(spaces, [current.url])
        if (locations.length) {
          // The default group first, when the page is saved there too.
          const own = locations.findIndex((l) => l.groupId === dest?.groupId)
          const ordered = own > 0 ? [locations[own], ...locations.filter((_, i) => i !== own)] : locations
          setDestination(destinationOf(ordered[0]))
          setStatus({ kind: "known", locations: ordered })
          return
        }
        const match = bestSameHostMatch(spaces, current.url)
        if (match) return offer([match], "match")
        const continues = continuationTabs(spaces, current.url)
        if (continues.length >= 2) return offer(continues, "match")
        setStatus({ kind: "ready" })
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

  // A pick changes what is shown; only a saved tab is moved right away (its
  // own "Move to another group").
  const pickDestination = (picked: PickerValue) => run(async () => {
    setPicking(false)
    const dest: CaptureDestination = { ...picked }
    if (status.kind === "saved") return showCapture(await moveCapture(status.receipt, dest), dest)
    setDestination(dest)
    setSuggested(null)
    if (status.kind === "known" || status.kind === "already") setStatus({ kind: "ready", copy: true })
  })

  // Save the page to the place on screen.
  const save = () => run(async () => {
    if (!currentTab || !destination) return
    setPicking(false)
    showCapture(await captureTabs([currentTab], destination, { dedupe: true }), destination)
  })

  const undo = () => run(async () => {
    if (status.kind !== "saved") return
    await undoCapture(status.receipt)
    setPicking(false)
    setStatus({ kind: "removed" })
  })

  const updateSelected = () => run(async () => {
    if (status.kind !== "offer" || !currentTab) return
    setPicking(false)
    await applyUpdate(currentTab, status.offers[status.selected].link, status.reason)
  })

  const selectOffer = (i: number) => {
    if (status.kind !== "offer") return
    setDestination(destinationOf(status.offers[i].link))
    setStatus({ ...status, selected: i })
  }

  // Leave the saved tab as it is and save this page as a new one, in its group.
  const offerAsNew = () => {
    if (status.kind !== "offer") return
    setSuggested(null)
    setDestination(destinationOf(status.offers[status.selected].link))
    setStatus({ kind: "ready" })
  }

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

  // Already saved: take the dashboard there and point at the card.
  const openSaved = () => run(async () => {
    if (status.kind !== "known" || !currentTab) return
    const at = status.locations[0]
    const card = findSavedCard(savedSpaces, at, currentTab.url)
    await openInFlexTab({ spaceId: at.spaceId, projectId: at.projectId, categoryId: at.categoryId, flash: card ? { kind: "tab", id: card } : { kind: "group", id: at.groupId } })
    window.close()
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

  // This window: the other tabs join the page's group, or the one picked for them.
  const saveWindow = (close: boolean) => run(async () => {
    const dest = windowDest ?? destination
    if (!dest) return // the row asks for a group first
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
  const loading = authLoading || !hydrated || status.kind === "reading"

  const place = placeOf(savedSpaces, destination)
  const alsoSaved = status.kind === "saved" ? describeAlsoSaved(status.receipt.alsoIn ?? [])
    : status.kind === "known" ? describeAlsoSaved(status.locations.slice(1).map((l) => l.path))
    : null
  const offer = status.kind === "offer" ? status.offers[status.selected] : null

  const ok = !loading && (status.kind === "saved" || status.kind === "already" || status.kind === "updated" || status.kind === "known")
  const tile = status.kind === "unsavable"
    ? <Icon icon={Ban} size="xl" className="text-fg-subtle" />
    : currentTab && <FaviconImg src={currentTab.favIconUrl} alt="" className="h-[22px] w-[22px]" />

  const lead = (t: string) => <span className="font-medium text-fg-muted">{t}</span>
  const groupName = <bdi>{place.group?.name}</bdi>
  const pageTitle = currentTab ? <bdi>{currentTab.title || currentTab.url}</bdi> : null
  const heading: ReactNode = loading ? lead("Loading…") : (() => {
    switch (status.kind) {
      case "ready": return lead(status.copy ? "Save a copy" : "Not in FlexTab")
      case "known": return <>{lead("Already in ")}{groupName}</>
      case "offer": return <>{lead("Saved as ")}<bdi>{offer!.label}</bdi></>
      case "saved": return <>{lead("Saved to ")}{groupName}</>
      case "already": return <>{lead("Already in ")}{groupName}</>
      case "updated": return <><span className="sr-only">Updated: </span>{lead(status.change.name ? "Updated to " : "Updated in ")}<bdi>{status.change.name ? status.change.to : place.group?.name}</bdi></>
      case "reverted": case "removed": return lead("Not saved")
      case "failed": return <span role="alert">Could not save this tab</span>
      case "unsavable": return lead("This page can't be saved")
      case "error": return <span role="alert">Could not read your tabs</span>
    }
  })()
  const sub: ReactNode =
    loading ? null
    : status.kind === "ready" ? pageTitle
    : status.kind === "offer" ? <>This page is <bdi>{offer!.to}</bdi></>
    : status.kind === "updated" && status.change.name ? <>was <bdi>{status.change.from}</bdi>{closeAfter ? " · closes when you close this panel" : ""}</>
    : status.kind === "saved" && closeAfter ? "Closes when you close this panel."
    : status.kind === "reverted" ? <>Undone. The saved tab is back on <bdi>{status.change.name ? status.change.from : "its old page"}</bdi>.</>
    : status.kind === "removed" ? "Undone. This tab is not in FlexTab."
    : status.kind === "failed" ? <span className="text-danger">Your browser refused to store it</span>
    : status.kind === "unsavable" ? "Browser pages stay out of FlexTab"
    : status.kind === "error" ? "Close and reopen this panel to try again"
    : null

  // Where the tab lives, or would go, one level per row. The group gets its
  // row unless the heading already names it.
  const where: { caption?: string; withGroup: boolean } | null =
    loading ? null
    : status.kind === "saved" || status.kind === "already" || status.kind === "known" ? { withGroup: false }
    : status.kind === "updated" || status.kind === "offer" ? { withGroup: true }
    : status.kind === "ready" && !status.copy && suggested ? { caption: SUGGESTED[suggested]!, withGroup: true }
    : status.kind === "ready" || status.kind === "removed" || status.kind === "reverted" ? { caption: "Save it to", withGroup: true }
    : status.kind === "failed" ? { caption: "It was going to", withGroup: true }
    : null

  const togglePagePicker = () => { setWindowPicking(false); setPicking((p) => !p) }
  // An offer, not a to-do: with nothing named, saving starts by picking where.
  const choose = destination
    ? { icon: FolderInput, label: "Choose another group", onClick: togglePagePicker, expanded: picking }
    : { icon: BookmarkPlus, label: "Save to a group", onClick: togglePagePicker, expanded: picking }
  const steps: Step[] =
    loading ? []
    : status.kind === "ready" || status.kind === "removed" || status.kind === "reverted" ? [
      // Saving needs a named place: until one is shown, picking is the step.
      ...(destination ? [{ icon: BookmarkPlus, label: `${status.kind === "ready" && status.copy ? "Save a copy to" : "Save to"} ${place.group?.name}`, onClick: save }] : []),
      choose,
    ]
    : status.kind === "known" ? [
      { icon: AppWindow, label: "Open in FlexTab", onClick: openSaved },
      { icon: CopyPlus, label: "Save a copy in another group", onClick: togglePagePicker, expanded: picking },
    ]
    : status.kind === "offer" ? [
      { icon: Replace, label: offer!.change.name ? `Update ${offer!.label} to ${offer!.to}` : "Update the saved tab to this page", onClick: updateSelected },
      { icon: CopyPlus, label: "Save as a new tab", onClick: offerAsNew },
    ]
    : status.kind === "saved" ? [
      { icon: FolderInput, label: "Move to another group", onClick: togglePagePicker, expanded: picking },
      { icon: Undo2, label: "Undo", onClick: undo },
    ]
    : status.kind === "already" ? [{ icon: CopyPlus, label: "Save a copy in another group", onClick: togglePagePicker, expanded: picking }]
    : status.kind === "updated" ? [
      { icon: CopyPlus, label: status.change.name ? `Keep ${status.change.from}, save as new` : "Keep the saved tab, save as new", onClick: saveAsNew },
      { icon: Undo2, label: "Undo", onClick: undoUpdate },
    ]
    : status.kind === "failed" ? [{ icon: RotateCw, label: "Try again", onClick: retry }]
    : []

  const n = others.length
  const windowGroup = windowReceipt ? placeOf(savedSpaces, toDestination(windowReceipt)).group?.name : null
  const saved = windowReceipt?.tabIds.length ?? 0
  const closed = windowReceipt?.closed.length ?? 0
  // "The same group" only reads when the page's place is on screen above.
  const windowTarget = windowDest ? placeOf(savedSpaces, windowDest).group?.name
    : where && place.space ? "the same group" : place.group?.name ?? place.category?.name
  const windowNamed = !!(windowDest ?? destination)

  return (
    <main className="flex w-80 flex-col gap-3.5 bg-black-900 p-4 font-sans text-fg">
      <h1 className="sr-only">FlexTab</h1>
      <section data-card="page" role="status" aria-live="polite" className="flex flex-col gap-3.5">
        <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3">
          <span className="relative grid h-11 w-11 place-items-center rounded-popup-tile bg-ink/[0.06]">
            {tile}
            {ok && <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-success ring-2 ring-black-900"><Icon icon={Check} size="badge-lg" className="text-black-900" /></span>}
          </span>
          <div className="min-w-0">
            {(() => {
              const sentence = <p ref={headingRef} data-slot="page-sentence" className="line-clamp-2 text-popup-title font-semibold text-fg [overflow-wrap:anywhere] data-[lines=2]:text-popup data-[lines=2]:leading-5">{heading}</p>
              // A sentence naming the group shows its full path. The tooltip hangs off the
              // sentence's visible two lines: the group name alone would count a line the
              // clamp hides, and the arrow would point at nothing (TASK-69).
              const namesGroup = !loading && (status.kind === "known" || status.kind === "saved" || status.kind === "already")
              return namesGroup && place.path ? <IconTooltip content={place.path}>{sentence}</IconTooltip> : sentence
            })()}
            {sub && <p data-slot="page-detail" className="mt-0.5 line-clamp-2 text-popup-meta text-fg-subtle [overflow-wrap:anywhere]">{sub}</p>}
          </div>
        </div>
        {/* Two or more saved episodes this page may continue: pick which one
            Update acts on. A chip only selects; the Update row does it. */}
        {status.kind === "offer" && status.offers.length > 1 && !picking && (
          <>
            <p className="-mb-1.5 text-popup-meta text-fg-subtle">Which saved {offer!.word}?</p>
            <ul aria-label={`Which saved ${offer!.word} to update`} className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5">
              {status.offers.map((o, i) => (
                <li key={o.tab.id} className="min-w-0">
                  <IconTooltip content={o.tab.title}>
                    <Chip size="panel" fullWidth selected={i === status.selected} disabled={busy} onClick={() => selectOffer(i)} aria-label={o.label}>
                      <span className="truncate">{o.chip}</span>
                    </Chip>
                  </IconTooltip>
                </li>
              ))}
            </ul>
          </>
        )}
        {/* While picking, the picker is the task: the place and the window
            part step aside so it sits under its row. */}
        {where && place.space && !picking && (
          <>
            {where.caption && <p className="-mb-1.5 text-popup-meta text-fg-subtle">{where.caption}</p>}
            <Location place={place} withGroup={where.withGroup} />
          </>
        )}
        {steps.length > 0 && <Steps steps={steps} disabled={busy} />}
        {picking && (
          <DestinationPicker
            groupLevel
            size="panel"
            // Nothing named yet: the tree opens where you are, with nothing ticked.
            value={destination ?? { spaceId: activeSpaceId ?? "", projectId: activeProjectId ?? "", categoryId: "" }}
            onChange={pickDestination}
            maxHeightClass="max-h-[216px]"
          />
        )}
        {alsoSaved && !picking && <p className="-mt-1.5 text-popup-meta text-fg-subtle [overflow-wrap:anywhere]">{alsoSaved}</p>}
      </section>
      {n > 0 && !loading && !picking && (
        <section aria-label="This window" className="flex flex-col gap-3.5 border-t border-ink/[0.08] pt-3.5">
          <p className="-mb-1.5 text-popup-meta text-fg-subtle [overflow-wrap:anywhere]">
            {!windowReceipt ? <>This window · {n} other tab{n === 1 ? "" : "s"}</>
              : saved ? <>Saved {saved} tab{saved === 1 ? "" : "s"} to <bdi>{windowGroup}</bdi>{closed ? ` · ${closed} closed` : ""}</>
              : <>Already in <bdi>{windowGroup}</bdi>{closed ? ` · ${closed} closed` : ""}</>}
          </p>
          {/* One way, as Settings › Saving says: saved, or saved and closed. */}
          <Steps disabled={busy} steps={!windowReceipt ? [
            ...(windowNamed ? [closeAfter
              ? { icon: ListX, label: windowDest ? `Save and close them in ${windowTarget}` : "Save and close them", onClick: () => saveWindow(true) }
              : { icon: BookmarkPlus, label: windowTarget ? `Save them to ${windowTarget}` : "Save them", onClick: () => saveWindow(false) }] : []),
            // Their own picker, here under their own row: never the page's.
            { icon: windowNamed ? FolderInput : BookmarkPlus, label: windowNamed ? "Choose another group for them" : "Save them to a group",
              onClick: () => { setPicking(false); setWindowPicking((p) => !p) }, expanded: windowPicking },
          ] : [
            // Not a second bare "Undo" next to the page's own.
            ...(saved ? [{ icon: Undo2, label: closed ? `Undo, reopen ${closed} tab${closed === 1 ? "" : "s"}` : "Undo saving them", onClick: undoWindow }] : []),
          ]} />
          {windowPicking && !windowReceipt && (
            <DestinationPicker
              groupLevel
              size="panel"
              value={windowDest ?? destination ?? { spaceId: activeSpaceId ?? "", projectId: activeProjectId ?? "", categoryId: "" }}
              onChange={(picked) => { setWindowDest({ ...picked }); setWindowPicking(false) }}
              maxHeightClass="max-h-[216px]"
            />
          )}
        </section>
      )}
    </main>
  )
}

/** The saved card for this page at a location, to point at it. */
function findSavedCard(spaces: SavedSpace[], at: SavedLocation, url: string | undefined): string | null {
  const group = spaces.find((s) => s.id === at.spaceId)?.projects.find((p) => p.id === at.projectId)
    ?.categories.find((c) => c.id === at.categoryId)?.groups.find((g) => g.id === at.groupId)
  return group?.tabs.find((t) => normalizeUrl(t.url) === normalizeUrl(url))?.id ?? null
}

/**
 * Where a suggested place comes from, in the person's words (TASK-75). Only
 * places you saved to are suggested; "first" shows only in an empty workspace.
 */
const SUGGESTED: Partial<Record<DestinationSource, string>> = {
  recentGroup: "Last saved to",
  recentCategory: "Last saved in this category",
  first: "Saving creates a new space",
}

type Step = { icon: LucideIcon; label: string; onClick: () => void; expanded?: boolean; name?: string }

/** The panel's actions: one box of full-width rows, an icon and a short label each. */
function Steps({ steps, disabled }: { steps: Step[]; disabled: boolean }) {
  if (steps.length === 0) return null
  return (
    <ActionList>
      {steps.map(({ icon, label, onClick, expanded, name }) => (
        <ActionRow key={label} icon={icon} onClick={onClick} disabled={disabled} expanded={expanded} aria-label={name}>
          {label}
        </ActionRow>
      ))}
    </ActionList>
  )
}

type Place = { path: string | null; space?: { name: string; abbreviation?: string; color?: string }; project?: { name: string }; category?: { name: string }; group?: { name: string; unsorted: boolean } }

/**
 * The place a destination names, the way a save resolves it (TASK-20,
 * TASK-75): a missing level is the one the save would use or create
 * ("Personal", "General", "Uncategorized"), and no group means the
 * category's Unsorted. So the panel names the place before anything exists.
 */
function placeOf(spaces: SavedSpace[], d: CaptureDestination | null): Place {
  if (!d) return { path: null }
  const space = spaces.find((s) => s.id === d.spaceId) ?? spaces[0]
  const project = space?.projects.find((p) => p.id === d.projectId) ?? space?.projects[0]
  const category = project?.categories.find((c) => c.id === d.categoryId) ?? project?.categories[0]
  const chosen = d.groupId ? category?.groups.find((g) => g.id === d.groupId) : undefined
  const group = chosen
    ? { name: chosen.name, unsorted: isUnsortedGroup(chosen) }
    : d.newGroupName?.trim() ? { name: d.newGroupName.trim(), unsorted: false }
    : { name: findUnsorted(category)?.name ?? UNSORTED_NAME, unsorted: true }
  const names = [space?.name ?? DEFAULT_SPACE_NAME, project?.name ?? DEFAULT_PROJECT_NAME, category?.name ?? DEFAULT_CATEGORY_NAME, group.name]
  return {
    path: names.join(" › "),
    space: space ?? { name: DEFAULT_SPACE_NAME },
    project: { name: names[1] },
    category: { name: names[2] },
    group,
  }
}

/** Where the tab lives, one level per row at body size, each with its level's icon. */
function Location({ place, withGroup }: { place: Place; withGroup: boolean }) {
  const icon = "text-fg-subtle"
  const rows: Array<[ReactNode, string | undefined]> = [
    [<SpaceAvatar key="s" space={place.space} size={18} />, place.space?.name],
    [<ProjectIcon key="p" size="md" className={icon} />, place.project?.name],
    [<CategoryIcon key="c" size="md" className={icon} />, place.category?.name],
    ...(withGroup && place.group ? [[place.group.unsorted ? <UnsortedIcon key="g" size="md" className={icon} /> : <GroupIcon key="g" size="md" className={icon} />, place.group.name] as [ReactNode, string]] : []),
  ]
  return (
    <div aria-label={place.path ?? undefined} className="flex flex-col rounded-popup border border-ink/[0.09] px-[11px] py-1.5">
      {rows.filter(([, name]) => name).map(([glyph, name]) => (
        <div key={name + String((glyph as { key?: string }).key)} className="grid min-h-[30px] grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 text-popup text-fg-muted">
          <span className="flex justify-center">{glyph}</span>
          <ClippedTooltip content={name}><bdi data-clip className="truncate">{name}</bdi></ClippedTooltip>
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
    return { link, tab, change: c, label, to: c.to, chip: short ? `${short} ${m![2]}` : label, word: m && short ? m[1].toLowerCase() : "tab", n: lastNumber(label), toN: lastNumber(c.to) }
  })
  const byNumber = [...items].sort((a, b) => (isNaN(a.n) || isNaN(b.n) ? 0 : a.n - b.n))
  const below = byNumber.filter((i) => !isNaN(i.n) && !isNaN(i.toN) && i.n < i.toN)
  const first = below.length ? below[below.length - 1] : items[0]
  return [first, ...byNumber.filter((i) => i !== first)]
}

/** The popup's root: its tooltips need a provider, with the new tab page's delay (TASK-69). */
function PopupRoot() {
  return (
    <TooltipProvider delayDuration={300}>
      <IndexPopup />
    </TooltipProvider>
  )
}

export default PopupRoot
