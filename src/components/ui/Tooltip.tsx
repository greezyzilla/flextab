import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

/** Wrap the app once so all tooltips share timing. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RT.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </RT.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          className="tt-content z-[120] select-none rounded-md border border-white/10 bg-black-800 px-2 py-1 text-[11px] font-medium text-white/85 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
        >
          {content}
          <RT.Arrow className="fill-black-800" width={10} height={5} />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
