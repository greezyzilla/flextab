import * as RS from "@radix-ui/react-select";
import type { ReactNode } from "react";
import { cn } from "~src/lib/utils";

function Chevron() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/40">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Select({
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RS.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <RS.Trigger
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-2 text-xs text-white/90 outline-none transition-colors hover:border-white/20 focus:border-white/30 disabled:opacity-40 data-[placeholder]:text-white/40",
          className,
        )}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon>
          <Chevron />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={5}
          className="rs-content z-[110] max-h-[--radix-select-content-available-height] min-w-[--radix-select-trigger-width] overflow-hidden rounded-lg border border-white/10 bg-black-900 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
        >
          <RS.Viewport className="p-1">{children}</RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RS.Item
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-xs text-white/80 outline-none transition-colors data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white data-[state=checked]:text-[var(--accent)]"
    >
      <RS.ItemText>{children}</RS.ItemText>
    </RS.Item>
  );
}
