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

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonProps) {
  const layout =
    variant === "link"
      ? "text-[13px] gap-1.5"
      : `rounded-lg ${sizeClass[size]}`;
  return (
    <button
      className={`inline-flex items-center justify-center font-sans font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)] ${layout} ${variantClass[variant]} ${className}`}
      {...props}
    />
  );
}

/** Square icon button (the action-icon pattern). */
export function IconButton({
  danger = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md p-1.5 text-white/40 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-subtle)] ${
        danger ? "hover:bg-red-400/10 hover:text-red-400" : "hover:bg-white/10 hover:text-white/80"
      } ${className}`}
      {...props}
    />
  );
}
