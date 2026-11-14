/**
 * A list of classes: the course, its time, and its room. The room is a button that opens
 * walking directions to the building when the building's position is known (RoomLink).
 */
import type { ClassSession } from "../api.ts";
import { timeRange } from "../format.ts";
import { CourseTitle } from "./CourseTitle.tsx";
import RoomLink from "./RoomLink.tsx";

export default function ClassRows({ classes }: { classes: ClassSession[] }) {
  if (classes.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {classes.map((c, i) => (
        <li key={`${c.course_code}-${i}`} className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <CourseTitle code={c.course_code} name_th={c.name_th} name_en={c.name_en} className="font-medium" />
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{timeRange(c.start_time, c.end_time)}</p>
          </div>
          <RoomLink room={c.room} />
        </li>
      ))}
    </ul>
  );
}
