import * as React from "react"

/**
 * A place, one level per row (TASK-103.5; the popup's "where this is saved"): a hairline box of
 * 30px rows, each the level's icon centred in a 20px column, then its name in the popup's body type.
 */
export function PlaceCard(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="flex flex-col rounded-popup border border-ink/[0.09] px-[11px] py-1.5" {...props} />
}

export function PlaceCardRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[30px] grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 text-popup text-fg-muted">
      <span className="flex justify-center">{icon}</span>
      {children}
    </div>
  )
}
