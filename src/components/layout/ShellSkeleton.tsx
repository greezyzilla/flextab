import { BrandMark } from "~src/components/ui/brand-mark"
import { Skeleton, SkeletonRegion } from "~src/components/ui/skeleton"
import { useShellLayout } from "~src/hooks/useMediaQuery"
import { PANEL_HEADER, PANEL_LIST } from "./panelChrome"

/**
 * The new tab while the workspace loads (TASK-106): the app shell itself, with the rail, the space
 * panel, the content column and Opened tabs at their real widths and their 64px header line, so
 * nothing moves when the workspace arrives. The frame and the brand show at once; the bars stand in
 * for data and wait 200ms, so a quick load shows only the frame.
 */
export function ShellSkeleton() {
  const { leftInline, rightInline } = useShellLayout()
  return (
    <SkeletonRegion label="Loading your workspace" late={false}>
      <div className="flex h-screen w-screen overflow-hidden bg-black-900">
      <div className="flex h-full w-16 flex-col border-r border-line">
        <div className="flex h-16 w-full shrink-0 items-center justify-center border-b border-line">
          <BrandMark />
        </div>
        <div className="flex flex-1 flex-col items-center gap-3 pb-4 pt-2">
          <Skeleton late width={40} height={40} round="full" />
          <Skeleton late width={40} height={40} round="full" tone="faint" />
        </div>
        {/* Settings and the account, at the rail's foot as in ProfilePanel. */}
        <div className="flex flex-col items-center gap-2 py-4">
          <Skeleton late width={40} height={40} round="full" tone="faint" />
          <Skeleton late width={40} height={40} round="full" tone="faint" />
        </div>
      </div>

      {leftInline && (
        <div className="flex h-full w-64 flex-col">
          <div className={PANEL_HEADER}>
            <Skeleton late line={32} width={96} height={18} />
          </div>
          <div className={PANEL_LIST}>
            <TreeRow depth={0} width={92} />
            <TreeRow depth={1} width={78} />
            <TreeRow depth={1} width={64} />
            <TreeRow depth={0} width={70} />
          </div>
          {/* The panel footer (PanelFooter): its Shortcuts button on the right. */}
          <div className="flex items-center justify-end border-t border-line px-4 py-2">
            <Skeleton late width={76} height={28} round="md" tone="faint" />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col border-x border-line">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-5">
          <div className="max-w-lg flex-1">
            <Skeleton late width="100%" height={36} round="md" tone="faint" />
          </div>
        </div>
        <div className="flex h-14 shrink-0 items-center border-b border-line px-6">
          <Skeleton late line={20} width={220} height={10} tone="faint" />
        </div>
        <div className="flex h-12 shrink-0 items-center border-b border-line px-6">
          <Skeleton late line={24} width={140} height={14} />
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">
          <GroupCard rows={3} />
          <GroupCard rows={2} />
        </div>
      </div>

      {rightInline && (
        <div className="flex h-full w-80 flex-col">
          <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
            <Skeleton late line={20} width={104} height={12} />
          </div>
          <div className="flex h-14 shrink-0 items-center border-b border-line pl-4 pr-6">
            <Skeleton late line={20} width={120} height={10} tone="faint" />
          </div>
          <div className="flex flex-col gap-1 p-2">
            <TabRow />
            <TabRow />
          </div>
        </div>
      )}
      </div>
    </SkeletonRegion>
  )
}

/** A sidebar tree row: 32px tall, a category indented past the project's chevron column. */
function TreeRow({ depth, width }: { depth: 0 | 1; width: number }) {
  return (
    <div className={depth === 0 ? "mx-2 flex h-8 items-center gap-2 pl-6" : "mx-2 flex h-8 items-center gap-2 pl-8"}>
      <Skeleton late width={depth === 0 ? 14 : 12} height={depth === 0 ? 14 : 12} />
      <Skeleton late line={20} width={width} height={10} tone={depth === 0 ? "base" : "faint"} />
    </div>
  )
}

/** A group card: its header line, then saved-tab rows. */
function GroupCard({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line p-3">
      <div className="flex h-8 items-center gap-2 px-1">
        <Skeleton late width={14} height={14} />
        <Skeleton late line={20} width={120} height={10} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-2.5 rounded-lg bg-ink/[0.02] px-3">
          <Skeleton late width={20} height={20} round="full" tone="faint" />
          <div className="flex min-w-0 flex-1 flex-col">
            <Skeleton late line={16} width={`${[42, 30, 36][i % 3]}%`} height={9} />
            <Skeleton late line={14} width={`${[28, 22, 32][i % 3]}%`} height={7} tone="faint" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** An Opened tabs row: favicon, title and address. */
function TabRow() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5">
      <Skeleton late width={20} height={20} round="full" tone="faint" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton late line={16} width="60%" height={9} />
        <Skeleton late line={14} width="44%" height={7} tone="faint" />
      </div>
    </div>
  )
}
