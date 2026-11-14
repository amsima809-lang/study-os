/**
 * A class's room. When the building's position is known it is a button for walking directions
 * to the building (see Directions.tsx: on a Google map inside the app when the site has a key,
 * otherwise in Google Maps); when it is not, it is just the room, as text.
 */
import { positionOfRoom } from "../maps/locate.ts";
import { DirectionsButton } from "./Directions.tsx";
import Icon from "./Icon.tsx";

export default function RoomLink({ room }: { room: string | null }) {
  if (!room) return null;
  const place = positionOfRoom(room);
  if (!place) return <span style={{ color: "var(--text-tertiary)" }}>{room}</span>;
  return (
    <DirectionsButton
      to={place}
      label={room}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 min-h-11 text-sm font-medium whitespace-nowrap"
      style={{ borderColor: "var(--border)", color: "var(--accent-text)", backgroundColor: "var(--bg-surface)" }}
    >
      <Icon name="mapPin" size={15} />
      {room}
    </DirectionsButton>
  );
}
