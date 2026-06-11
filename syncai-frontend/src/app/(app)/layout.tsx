"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconNav } from "@/components/layout/icon-nav";
import { useAuthStore } from "@/store/auth";
import { users as usersApi } from "@/lib/api";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setUser, logout } = useAuthStore();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    // Zustand에 유저 없으면 서버에 확인
    if (!user) {
      usersApi.me()
        .then((res) => setUser(res.data))
        .catch(() => {
          logout();
          router.replace("/login");
        });
    }
  }, []);

  return (
    <div className="flex h-full bg-[var(--bg-base)]">
      <IconNav />
      <div className="flex-1 flex overflow-hidden">{children}</div>
    </div>
  );
}
