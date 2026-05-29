"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, leftIcon, style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-medium tracking-wide"
            style={{ color: "var(--text-soft)" }}>
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span style={{
              position: "absolute", left: 12, top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none",
              zIndex: 10, color: "var(--text-muted)",
            }}>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full h-11 rounded-lg border transition-all duration-150",
              "focus:outline-none",
              error && "border-[var(--red)]",
              className
            )}
            style={{
              background: "var(--bg-soft)",
              borderColor: error ? "var(--red)" : "var(--border-strong)",
              color: "var(--text)",
              paddingLeft: leftIcon ? 40 : 12,
              paddingRight: 12,
              fontSize: 14,
              ...style,
            }}
            onFocus={(e) => {
              e.currentTarget.style.background = "var(--bg-elev)";
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 0 4px var(--accent-bg)";
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              e.currentTarget.style.background = "var(--bg-soft)";
              e.currentTarget.style.borderColor = error ? "var(--red)" : "var(--border-strong)";
              e.currentTarget.style.boxShadow = "none";
              props.onBlur?.(e);
            }}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs" style={{ color: "var(--red)" }}>{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
