import { ActionList, ActionRowSkeleton } from "~src/components/ui/action-row"
import { PageTile } from "~src/components/ui/page-tile"
import { Skeleton } from "~src/components/ui/skeleton"

/**
 * The popup while it reads the page (TASK-106, TASK-107): the same box, tile, sentence and detail
 * lines and action row as the popup's own loading state, at the same places. Its static markup is
 * the body of popup.html (src/popup/index.html, kept equal by a test), so the first frame shows it
 * before the app's script has loaded; the popup removes it in its first commit, before that paints.
 */
export function PopupSkeleton() {
  return (
    <main className="flex w-80 flex-col gap-3.5 bg-black-900 p-4 font-sans text-fg">
      <section className="flex flex-col gap-3.5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
          <PageTile>{null}</PageTile>
          <div className="min-w-0">
            <Skeleton line={24} width="72%" height={14} />
            <div className="mt-0.5"><Skeleton line={18} width="48%" height={10} tone="faint" /></div>
          </div>
        </div>
        <ActionList><ActionRowSkeleton /></ActionList>
      </section>
    </main>
  )
}

/** The id of the static copy in popup.html. */
export const BOOT_SKELETON_ID = "boot-skeleton"
