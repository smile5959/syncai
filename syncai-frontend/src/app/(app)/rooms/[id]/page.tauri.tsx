import RoomPageWrapper from "./RoomPageWrapper";

export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function Page() {
  return <RoomPageWrapper />;
}
