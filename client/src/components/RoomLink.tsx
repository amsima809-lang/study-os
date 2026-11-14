/**
 * A class's room. When the building's position is known it is a button that opens walking
 * directions to the building in Google Maps (the app, on a phone that has it); otherwise it is
 * just the room, as text.
 */
import { useT } from "../i18n.tsx";
import { directionsUrl, positionOfRoom } from "../maps/locate.ts";
import Icon from "./Icon.tsx";

export default function RoomLink({ room }: { room: string | null }) {
  const { t } = useT();
  if (!room) return null;
  const place = positionOfRoom(room);
  if (!place) return <span style={{ color: "var(--text-tertiary)" }}>{room}</span>;
  return (
    <a
      href={directionsUrl(place)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("map.directionsTo", { room })}
      title={t("map.directionsTo", { room })}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 min-h-11 text-sm font-medium whitespace-nowrap"
      style={{ borderColor: "var(--border)", color: "var(--accent-text)", backgroundColor: "var(--bg-surface)" }}
    >
      <Icon name="mapPin" size={15} />
      {room}
    </a>
  );
}
