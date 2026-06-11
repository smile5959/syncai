import RoomPageWrapper from "./RoomPageWrapper";

export function generateStaticParams() {
  // Tauri static export: __placeholder__ 사전 빌드 필요
  // Vercel: 빈 배열 반환 → 모든 params 온디맨드 렌더링 (동적 라우트처럼 동작)
  if (process.env.TAURI === "1") {
    return [{ id: "__placeholder__" }];
  }
  return [];
}

export default function Page() {
  return <RoomPageWrapper />;
}
