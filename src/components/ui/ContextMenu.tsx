import * as CM from "@radix-ui/react-context-menu";
import type { ComponentProps } from "react";

export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

export function ContextMenuContent({
  className = "",
  children,
  ...props
}: ComponentProps<typeof CM.Content>) {
  return (
    <CM.Portal>
      <CM.Content
        className={`menu-content z-[110] min-w-[9rem] overflow-hidden rounded-lg border border-white/10 bg-black-900 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] ${className}`}
        {...props}
      >
        {children}
      </CM.Content>
    </CM.Portal>
  );
}

export function ContextMenuItem({
  className = "",
  destructive = false,
  ...props
}: ComponentProps<typeof CM.Item> & { destructive?: boolean }) {
  return (
    <CM.Item
      className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ${
        destructive
          ? "text-red-400/80 data-[highlighted]:bg-red-400/10 data-[highlighted]:text-red-400"
          : "text-white/70 data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white"
      } ${className}`}
      {...props}
    />
  );
}
