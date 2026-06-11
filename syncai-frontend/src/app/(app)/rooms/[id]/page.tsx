export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

import RoomPageWrapper from "./RoomPageWrapper";

export default function Page() {
  return <RoomPageWrapper />;
}
