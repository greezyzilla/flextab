import * as DM from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({
  className = "",
  children,
  ...props
}: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={6}
        className={`menu-content z-[110] min-w-[11rem] overflow-hidden rounded-lg border border-white/10 bg-black-900 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] ${className}`}
        {...props}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function DropdownMenuItem({
  className = "",
  destructive = false,
  ...props
}: ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  return (
    <DM.Item
      className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ${
        destructive
          ? "text-red-400/80 data-[highlighted]:bg-red-400/10 data-[highlighted]:text-red-400"
          : "text-white/70 data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white"
      } ${className}`}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 py-1.5">{children}</DM.Label>;
}

export function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-white/[0.06]" />;
}
