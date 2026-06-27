import * as RSwitch from "@radix-ui/react-switch";

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <RSwitch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 shrink-0 rounded-full bg-white/10 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)] data-[state=checked]:bg-[var(--accent)]"
      >
        <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 will-change-transform data-[state=checked]:translate-x-[18px]" />
      </RSwitch.Root>
      {label && <span className="font-sans text-[11px] text-white/50">{label}</span>}
    </label>
  );
}
