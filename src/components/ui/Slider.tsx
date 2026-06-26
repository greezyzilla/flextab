import * as RSlider from "@radix-ui/react-slider";

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className = "",
}: {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <RSlider.Root
      value={[value]}
      onValueChange={(v) => onValueChange(v[0])}
      min={min}
      max={max}
      step={step}
      className={`relative flex h-5 touch-none select-none items-center ${className}`}
    >
      <RSlider.Track className="relative h-1.5 grow rounded-full bg-white/10">
        <RSlider.Range className="absolute h-full rounded-full bg-[var(--accent)]" />
      </RSlider.Track>
      <RSlider.Thumb
        aria-label="Value"
        className="block h-3.5 w-3.5 rounded-full border-2 border-white/20 bg-[var(--accent)] shadow outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--accent-subtle)]"
      />
    </RSlider.Root>
  );
}
