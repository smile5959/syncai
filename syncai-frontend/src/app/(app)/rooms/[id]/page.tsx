// 정적 export: 동적 라우트. 실제 room ID는 클라이언트에서 처리
// 더미 경로 1개를 생성해 Next.js가 라우트를 인식하게 함
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

import RoomPageClient from "./RoomPageClient";

export default function Page() {
  return <RoomPageClient />;
}
