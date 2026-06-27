import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~src/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-sans font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)]",
  {
    variants: {
      variant: {
        primary: "accent-fill",
        secondary: "bg-white/[0.08] text-white/85 hover:bg-white/[0.13]",
        ghost: "border border-white/10 text-white/70 hover:border-white/25 hover:bg-white/[0.04] hover:text-white",
        danger: "bg-red-500/90 text-white hover:bg-red-500",
        link: "rounded-none text-white/55 hover:text-white",
      },
      size: {
        sm: "px-3 py-1.5 text-xs gap-1.5",
        md: "px-3.5 py-2 text-[13px] gap-2",
      },
    },
    compoundVariants: [
      { variant: "link", size: "sm", class: "px-0 py-0" },
      { variant: "link", size: "md", class: "px-0 py-0" },
    ],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, ...props },
  ref,
) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

/**
 * Square icon button. Forms are flexible (icon-only here; pair with Button for
 * icon+text), but styling always comes from a defined variant — never ad-hoc.
 *   default — hover background (prominent actions)
 *   subtle  — hover color only, no background (disclosure / inline affordances)
 */
const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)]",
  {
    variants: {
      variant: {
        default: "text-white/40 hover:bg-white/10 hover:text-white/80",
        subtle: "text-white/40 hover:text-white/75",
      },
      danger: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "default", danger: true, class: "text-white/40 hover:bg-red-400/10 hover:text-red-400" },
      { variant: "subtle", danger: true, class: "text-white/40 hover:text-red-400" },
    ],
    defaultVariants: { variant: "default", danger: false },
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant, danger, className, ...props },
  ref,
) {
  return <button ref={ref} className={cn(iconButtonVariants({ variant, danger }), className)} {...props} />;
});
