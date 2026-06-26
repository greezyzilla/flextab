import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md";

const variantClass: Record<Variant, string> = {
  primary: "accent-fill",
  secondary: "bg-white/[0.08] text-white/85 hover:bg-white/[0.13]",
  ghost: "border border-white/10 text-white/70 hover:border-white/25 hover:bg-white/[0.04] hover:text-white",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
  link: "text-white/55 hover:text-white",
};

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-3.5 py-2 text-[13px] gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", ...props },
  ref,
) {
  const layout = variant === "link" ? "text-[13px] gap-1.5" : `rounded-lg ${sizeClass[size]}`;
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center font-sans font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)] ${layout} ${variantClass[variant]} ${className}`}
      {...props}
    />
  );
});

/**
 * Square icon button. Forms are flexible (icon-only here; pair with Button for
 * icon+text), but the styling always comes from one of these variants — never
 * ad-hoc classes.
 *   default — hover background (prominent actions)
 *   subtle  — hover color only, no background (disclosure / inline affordances)
 */
type IconVariant = "default" | "subtle";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconVariant;
  danger?: boolean;
}

const iconClass: Record<IconVariant, { base: string; danger: string }> = {
  default: {
    base: "text-white/40 hover:bg-white/10 hover:text-white/80",
    danger: "text-white/40 hover:bg-red-400/10 hover:text-red-400",
  },
  subtle: {
    base: "text-white/40 hover:text-white/75",
    danger: "text-white/40 hover:text-red-400",
  },
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "default", danger = false, className = "", ...props },
  ref,
) {
  const tone = iconClass[variant][danger ? "danger" : "base"];
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)] ${tone} ${className}`}
      {...props}
    />
  );
});
