"use client";
import dynamic from "next/dynamic";

const RoomPageClient = dynamic(() => import("./RoomPageClient"), { ssr: false });

export default function RoomPageWrapper() {
  return <RoomPageClient />;
}
