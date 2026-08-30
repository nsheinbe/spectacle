import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-beam text-canvas hover:brightness-110 disabled:hover:brightness-100 font-medium",
  secondary:
    "border border-line bg-surface text-text hover:bg-surface-raised",
  ghost: "text-text-muted hover:text-text hover:bg-surface",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-sm",
  md: "h-10 px-4 text-sm rounded",
  lg: "h-12 px-6 text-base rounded-lg",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
