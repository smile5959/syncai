import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "green" | "yellow" | "red" | "purple" | "muted";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  style?: React.CSSProperties;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]",
  green: "bg-green-500/10 text-green-400 border-green-500/20",
  yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  red: "bg-red-500/10 text-red-400 border-red-500/20",
  purple: "bg-[var(--accent-glow)] text-[#a78bfa] border-[var(--ai-border)]",
  muted: "bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-[var(--text-muted)]",
  green: "bg-green-400",
  yellow: "bg-yellow-400",
  red: "bg-red-400",
  purple: "bg-[var(--accent)]",
  muted: "bg-[var(--text-muted)]",
};

export function Badge({ variant = "default", children, className, dot, style }: BadgeProps) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        variants[variant],
        className
      )}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[variant])} />
      )}
      {children}
    </span>
  );
}
