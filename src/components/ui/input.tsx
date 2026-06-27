import { forwardRef } from "react";
import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~src/lib/utils";

const inputVariants = cva("font-sans outline-none", {
  variants: {
    variant: {
      // Form field — bordered, used in modals/settings/auth.
      default:
        "bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 transition-colors placeholder:text-white/30 focus:border-white/25 disabled:opacity-50",
      // Inline rename — sits in place of a label, ring focus.
      inline:
        "bg-white/10 rounded px-2 py-0.5 text-sm text-white/90 min-w-0 focus:ring-1 focus:ring-[var(--accent)]",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant, className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputVariants({ variant }), className)} {...props} />;
});

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("font-sans text-[11px] text-white/45", className)} {...props} />;
}
