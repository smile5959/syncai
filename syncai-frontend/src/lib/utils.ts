import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(dateStr: string): string {
  // +00:00 없는 naive UTC 문자열도 UTC로 강제 해석
  const normalized = dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)
    ? dateStr
    : dateStr + "Z";
  const d = new Date(normalized);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    // 영문 이름: 각 단어 첫 글자
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // 한글 단어 또는 단일 단어: 첫 1글자
  return name[0].toUpperCase();
}
