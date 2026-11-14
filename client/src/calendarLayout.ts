/**
 * Pure layout maths for the hour-by-hour calendar (no React), so it can be
 * tested on its own. See components/TimeGrid.tsx for the drawing.
 */
import type { CalEvent } from "./api.ts";

export const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** A timed event with no end (a reminder) is drawn half an hour tall. */
const span = (ev: CalEvent) => {
  const start = minutes(ev.start_time!);
  const end = ev.end_time ? minutes(ev.end_time) : start + 30;
  return { start, end: Math.max(end, start + 30) };
};

export type Placed = { ev: CalEvent; start: number; end: number; lane: number; lanes: number };
export type Overflow = { start: number; end: number; count: number; lanes: number };

/**
 * Put overlapping events side by side. Events that touch form a cluster; each
 * takes the first free lane. With `maxLanes`, only that many lanes are drawn
 * and the rest of the cluster is counted in `overflow` (shown as a "+N" badge).
 */
export function layoutDay(events: CalEvent[], maxLanes = Infinity): { placed: Placed[]; overflow: Overflow[] } {
  const timed = events
    .filter((e) => e.start_time)
    .map((ev) => ({ ev, ...span(ev) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: Placed[] = [];
  const overflow: Overflow[] = [];
  let cluster: Array<{ ev: CalEvent; start: number; end: number; lane: number }> = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    if (cluster.length === 0) return;
    const lanes = Math.min(laneEnds.length, maxLanes);
    const hidden = cluster.filter((c) => c.lane >= maxLanes);
    for (const c of cluster) if (c.lane < maxLanes) placed.push({ ...c, lanes });
    if (hidden.length) {
      overflow.push({
        start: Math.min(...cluster.map((c) => c.start)),
        end: Math.max(...cluster.map((c) => c.end)),
        count: hidden.length,
        lanes,
      });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const item of timed) {
    if (item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return { placed, overflow };
}
