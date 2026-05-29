"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      primary: "btn-gradient text-white active:scale-[0.98]",
      ghost:
        "text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg-soft)]",
      outline:
        "border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-soft)] hover:border-[var(--accent)]",
      danger:
        "bg-[var(--red)] text-white hover:opacity-90 active:scale-[0.98]",
    };

    const sizes = {
      sm: "h-7 px-3 text-xs",
      md: "h-9 px-4 text-sm",
      lg: "h-11 px-6 text-base",
      icon: "h-9 w-9 p-0",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
