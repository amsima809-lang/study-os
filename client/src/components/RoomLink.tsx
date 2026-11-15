/**
 * A class's room. When the room is in a building on one of the campus maps it is a button that
 * opens the map on that building, with a pin over it and a button that starts the walk in
 * Google Maps (RoomMap.tsx). When it is not, it is just the room, as text.
 */
import { useState } from "react";
import { useT } from "../i18n.tsx";
import { placeOf } from "../maps/locate.ts";
import RoomMapSheet from "./RoomMap.tsx";
import Icon from "./Icon.tsx";

export default function RoomLink({ room }: { room: string | null }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (!room) return null;
  const place = placeOf(room);
  if (!place) return <span style={{ color: "var(--text-tertiary)" }}>{room}</span>;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("map.whereIs", { room })}
        title={t("map.whereIs", { room })}
        className="inline-flex items-center gap-1 rounded-full border px-2.5 min-h-11 text-sm font-medium whitespace-nowrap"
        style={{ borderColor: "var(--border)", color: "var(--accent-text)", backgroundColor: "var(--bg-surface)" }}
      >
        <Icon name="mapPin" size={15} />
        {room}
      </button>
      {open && <RoomMapSheet room={room} campus={place.campus} code={place.code} onClose={() => setOpen(false)} />}
    </>
  );
}
