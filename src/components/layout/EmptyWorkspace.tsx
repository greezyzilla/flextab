// The workspace with no spaces (TASK-98, "a clean slate"). Nobody lands here on
// first install (the seed gives Personal › General › Uncategorized); it is the
// moment after someone deletes their last space while tidying up, or a
// workspace that came back empty. So it reads as "all clear" on purpose and
// offers the next space right away: a name field and four starters. The shell
// hides the empty tree panel and the empty location row, so this stage spans
// from the rail to Opened Tabs.
import { useState } from "react"
import { Button } from "~src/components/ui/button"
import { Input, INLINE_CREATE_HINT } from "~src/components/ui/input"
import { SpaceAvatar } from "~src/components/levelIcons"
import { useSavedSpacesStore } from "~src/store/useSavedSpacesStore"
import { createSpace } from "~src/lib/defaultPath"
import { Chip } from "~src/components/ui/chip"

/** Starters, each with a colour from the space palette (Settings › Spaces). */
export const STARTERS: { name: string; color: string }[] = [
  { name: "Work", color: "#2274F0" },
  { name: "Personal", color: "#8b5cf6" },
  { name: "Study", color: "#22c55e" },
  { name: "Side project", color: "#f97316" },
]

/** Creates the space with its default path and opens it on that category. */
function start(name: string, color?: string) {
  useSavedSpacesStore.getState().setActiveSpace(createSpace(name, color))
}

/** The loose tabs around the hero: FlexTab's material, look-only. Colours are the group tokens. */
const LOOSE_TABS: { title: string; letter: string; color: string }[] = [
  { title: "Pull request #91", letter: "G", color: "var(--group-purple)" },
  { title: "Checkout v3", letter: "F", color: "var(--group-pink)" },
  { title: "Sprint board", letter: "L", color: "var(--group-blue)" },
  { title: "Q4 planning", letter: "N", color: "var(--group-grey)" },
  { title: "Flights to Lisbon", letter: "K", color: "var(--group-cyan)" },
  { title: "CRDTs: a survey", letter: "A", color: "var(--group-red)" },
  { title: "Deployments", letter: "V", color: "var(--group-green)" },
  { title: "Recipe: ramen", letter: "Y", color: "var(--group-orange)" },
]

/**
 * Where each tab sits (left/top of the stage, %), its tilt and its drift delay.
 * A ring around the centred hero; the middle row (2, 3) sits beside the
 * headline and only fits on wide stages.
 */
export const RING: { left: number; top: number; r: string; d: string }[] = [
  { left: 12, top: 16, r: "-8deg", d: "0s" }, { left: 66, top: 14, r: "6deg", d: "1s" },
  { left: 8, top: 46, r: "5deg", d: "2s" }, { left: 74, top: 46, r: "-5deg", d: "0.5s" },
  { left: 16, top: 76, r: "-4deg", d: "1.5s" }, { left: 64, top: 78, r: "7deg", d: "2.5s" },
  { left: 38, top: 8, r: "3deg", d: "3s" }, { left: 40, top: 86, r: "-3deg", d: "1.8s" },
]
const WIDE_ONLY = new Set([2, 3])

/**
 * One opacity per tab from its distance to the stage's middle: 1 near the hero,
 * down to 0.3 at the rim. Each tab fades as a whole, so no gradient ever slices
 * across one.
 */
export function ringOpacity(spot: { left: number; top: number }): number {
  const x = (spot.left + 8 - 50) / 50 // the tab's centre, roughly 8% right of its left edge
  const y = (spot.top + 2 - 50) / 50
  const d = Math.min(1, Math.hypot(x, y)) // 0 middle, 1 rim
  return Math.round((1 - 0.7 * Math.max(0, (d - 0.55) / 0.45)) * 100) / 100
}

/** The desk: dots and the accent glow, centred on the hero. */
const DOTS = "radial-gradient(hsl(var(--ink) / 0.07) 1px, transparent 1px)"
const GLOW = "radial-gradient(45% 45% at 50% 45%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 75%)"

/** A browser tab, drawn small: letter tile, title, the close mark. */
function LooseTab({ tab, style }: { tab: typeof LOOSE_TABS[number]; style: React.CSSProperties }) {
  return (
    <div style={style} className="ft-drift absolute flex h-9 items-center gap-2 rounded-t-xl rounded-b-md bg-black-900 pl-2 pr-3 shadow-[0_14px_30px_-16px_rgba(0,0,0,0.55)] ring-1 ring-ink/10">
      <span className="flex h-5 w-5 items-center justify-center rounded-md text-caption font-semibold text-white" style={{ backgroundColor: tab.color }}>{tab.letter}</span>
      <span className="whitespace-nowrap text-fg font-sans text-xs">{tab.title}</span>
      <span className="ml-1 text-fg-subtle text-caption">×</span>
    </div>
  )
}

/** Name field with its own Create button; Enter creates, Escape clears. */
function CreateRow({ autoFocus }: { autoFocus: boolean }) {
  const [value, setValue] = useState("")
  const name = value.trim()
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (name) start(name) }}>
      <Input
        autoFocus={autoFocus}
        aria-label="New space name"
        aria-description={INLINE_CREATE_HINT}
        placeholder="Name a space"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setValue("") } }}
        variant="lg"
        className="flex-1"
      />
      <Button type="submit" variant="default" size="xl">Create</Button>
    </form>
  )
}

/**
 * Zero spaces. `request` is the Alt+N counter (TASK-81): each press remounts
 * the field focused.
 */
export function EmptyWorkspace({ request }: { request: number }) {
  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Faded to nothing before every edge (closest-side), so the stage melts
          into the header and Opened Tabs instead of stopping at their borders.
          A background layer, so the fade crosses no element. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(closest-side,black_40%,transparent_96%)]"
        style={{ backgroundImage: `${GLOW}, ${DOTS}`, backgroundSize: "auto, 18px 18px" }} />
      <div inert aria-hidden data-testid="loose-tabs" className="pointer-events-none absolute inset-0 select-none">
        {LOOSE_TABS.map((tab, i) => (
          <span key={tab.title} className={WIDE_ONLY.has(i) ? "max-xl:hidden" : ""} style={{ opacity: ringOpacity(RING[i]) }}>
            <LooseTab tab={tab} style={{ left: `${RING[i].left}%`, top: `${RING[i].top}%`, ["--r" as string]: RING[i].r, animationDelay: RING[i].d }} />
          </span>
        ))}
      </div>
      <div className="relative flex h-full items-center justify-center p-12">
        <div className="flex flex-col items-center gap-7 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.04] px-3 py-1 text-fg-muted font-sans text-xs">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />No spaces left
          </span>
          <h2 className="text-fg font-sans text-[3.25rem] font-semibold leading-[1.02] tracking-[-0.03em]">A clean{" "}<br />slate.</h2>
          <p className="max-w-md text-fg-muted font-sans text-base leading-relaxed">Every tab you keep lands in a space. Start one, and FlexTab sorts the rest as you save.</p>
          <div className="flex w-full max-w-md flex-col gap-3">
            <CreateRow key={request} autoFocus={request > 0} />
            <div role="group" aria-label="Starters" className="flex flex-wrap justify-center gap-2">
              {STARTERS.map(s => (
                <Chip key={s.name} size="pill" onClick={() => start(s.name, s.color)}>
                  <SpaceAvatar space={{ name: s.name, color: s.color }} size={22} />{s.name}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
