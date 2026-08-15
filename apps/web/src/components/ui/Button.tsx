"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// CVA-based variant composition — the model pattern the rest of the design
// system's primitives follow (see DESIGN_SYSTEM.md §2): variants are
// declared once here instead of as an inline lookup object per component,
// and every color reads a CSS variable from globals.css (never a raw
// Tailwind gray like `slate-100`) so dark mode Just Works without each
// component needing its own dark-mode branch.
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] disabled:opacity-50",
        secondary:
          "bg-transparent text-[var(--color-brand)] border border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] disabled:opacity-50",
        subtle: "bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-main)] disabled:opacity-50",
        danger: "bg-[var(--color-error)] text-white hover:opacity-90 disabled:opacity-50",
        ghost: "bg-transparent text-[var(--text-main)] hover:bg-[var(--bg-subtle)] disabled:opacity-50",
      },
      size: {
        sm: "text-xs px-3 py-1.5 gap-1.5 min-h-[32px]",
        md: "text-sm px-4 py-2 gap-2 min-h-[40px]",
        lg: "text-sm px-5 py-2.5 gap-2 min-h-[44px]",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, loading, icon, fullWidth, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, fullWidth }), (disabled || loading) && "cursor-not-allowed", className)}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
