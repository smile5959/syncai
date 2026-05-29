import { IconNav } from "@/components/layout/icon-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full bg-[var(--bg-base)]">
      <IconNav />
      <div className="flex-1 flex overflow-hidden">{children}</div>
    </div>
  );
}
