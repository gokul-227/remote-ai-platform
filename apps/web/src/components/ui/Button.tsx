"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] disabled:opacity-50",
  secondary:
    "bg-transparent text-[var(--color-brand)] border border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] disabled:opacity-50",
  subtle: "bg-transparent text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-main)] disabled:opacity-50",
  danger: "bg-[var(--color-error)] text-white hover:bg-red-700 disabled:opacity-50",
  ghost: "bg-transparent text-[var(--text-main)] hover:bg-slate-100 disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5 min-h-[32px]",
  md: "text-sm px-4 py-2 gap-2 min-h-[40px]",
  lg: "text-sm px-5 py-2.5 gap-2 min-h-[44px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, fullWidth, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer",
          "focus-visible:outline-none",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          (disabled || loading) && "cursor-not-allowed",
          className
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
