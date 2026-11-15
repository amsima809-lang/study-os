/**
 * The front page as a climb, after the logo: a cairn of books, the stack of stones that marks
 * a trail and the top of a mountain.
 *
 * `TrailPath` draws, behind the whole page:
 * - a mountain whose summit, capped in the brand's amber, stands just under the sign-in card
 *   (`data-trail-summit`). It is the highest point: every ridge behind it stays lower.
 * - a dotted trail that starts at the bottom (`data-trail-start`), passes every section's
 *   marker (`data-trail-stop`), and climbs the mountain in switchbacks to the foot of that
 *   amber cap.
 *   Between two markers it swings out to the side of its section (the marker's closest
 *   `data-trail-row`), the sides alternating, so it winds instead of running straight up the
 *   middle, and it passes behind the screenshots rather than through the text.
 *
 * Both are measured from the page as laid out, so they follow any screen width, language or
 * font, and are drawn again whenever the page changes size.
 */
import { useEffect, useState, type RefObject } from "react";

type Pt = { x: number; y: number };

/**
 * A smooth curve through the points (Catmull-Rom, as cubic Bézier segments). With `minX` and
 * `maxX` the control points are kept between them, and so the whole curve is (a Bézier stays
 * inside the hull of its control points): the trail never runs off the side of the page.
 */
export function smoothPath(p: Pt[], minX = -Infinity, maxX = Infinity): string {
  if (p.length < 2) return "";
  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M${r(p[0].x)},${r(p[0].y)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i], b = p[i], c = p[i + 1], e = p[i + 2] ?? c;
    const keep = (x: number) => Math.min(maxX, Math.max(minX, x));
    const c1 = { x: keep(b.x + (c.x - a.x) / 6), y: b.y + (c.y - a.y) / 6 };
    const c2 = { x: keep(c.x - (e.x - b.x) / 6), y: c.y - (e.y - b.y) / 6 };
    d += ` C${r(c1.x)},${r(c1.y)} ${r(c2.x)},${r(c2.y)} ${r(c.x)},${r(c.y)}`;
  }
  return d;
}

/**
 * The mountain, drawn on a 1440 × 420 grid with its summit at (720, 20) and its foot at
 * y = 420. Farthest ridge first. The summit is the only point above y = 120.
 */
const SUMMIT = { x: 720, y: 20 };
const RIDGES: { fill: string; opacity: number; rim?: boolean; points: [number, number][] }[] = [
  // Farther ridges are hazier, so lighter against the dusk sky.
  { fill: "#4b4692", opacity: 0.38, points: [[0, 190], [150, 140], [290, 185], [440, 120], [590, 170], [660, 140], [790, 150], [880, 120], [1010, 170], [1160, 125], [1310, 180], [1440, 150]] },
  { fill: "#3a3577", opacity: 1, rim: true, points: [[0, 250], [140, 195], [280, 240], [420, 170], [560, 215], [720, 20], [880, 200], [1020, 160], [1180, 230], [1320, 185], [1440, 225]] },
  // The nearest ridge is the colour the page continues in below the first screen.
  { fill: "#24243e", opacity: 1, points: [[0, 340], [180, 305], [360, 330], [560, 290], [720, 315], [900, 285], [1080, 325], [1260, 298], [1440, 330]] },
];
/** The summit's cap, in the brand's amber: the top book of the cairn. */
const CAP: [number, number][] = [[720, 20], [694, 52], [710, 47], [721, 60], [733, 45], [748, 52]];
/** How much wider than tall (in grid units) the mountain must stay, however narrow the window. */
const MIN_SPREAD = 1.25;
/** Where the trail ends: the middle of the cap's lower edge, so the amber cap sits above it. */
const CAP_BASE: [number, number] = [721, 58];
/** The trail's switchbacks up the mountain, from its foot to the summit (same grid). */
const CLIMB: [number, number][] = [[770, 400], [610, 330], [800, 250], [655, 170], [745, 95]];

export function TrailPath({ root, faint = false }: { root: RefObject<HTMLDivElement | null>; /** A campus photo is behind: keep the mountain light. */ faint?: boolean }) {
  const [shape, setShape] = useState<{ w: number; h: number; trail: string; ridges: string[]; rim: string; cap: string } | null>(null);

  // After the page is in place: the page's own reference (the parent's ref) is only attached
  // once its children's layout effects have run.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        const W = box.width, H = box.height;
        const at = (r: DOMRect, fx = 0.5, fy = 0.5): Pt => ({ x: r.left - box.left + r.width * fx, y: r.top - box.top + r.height * fy });
        const summit = el.querySelector("[data-trail-summit]");
        const start = el.querySelector("[data-trail-start]");
        const stops = [...el.querySelectorAll("[data-trail-stop]")];
        const hero = summit?.closest("section")?.getBoundingClientRect();
        if (!summit || !start || !hero) return;

        // Where the mountain stands: its peak just under the sign-in card, its foot at the
        // bottom of the first screen, and wide enough to reach both edges of the page.
        const card = at(summit.getBoundingClientRect(), 0.5, 1);
        const foot = hero.bottom - box.top;
        const peak = { x: card.x, y: Math.min(card.y + 28, foot - 180) };
        const ky = (foot - peak.y) / (420 - SUMMIT.y);
        // Wide enough to reach both edges of the page, but never narrower than its own
        // proportions allow: on a narrow window the mountain keeps its shape and its sides run
        // off the page, instead of squeezing into a needle.
        const kx = Math.max(Math.max(peak.x, W - peak.x) / SUMMIT.x, ky * MIN_SPREAD);
        const place = ([x, y]: [number, number]): Pt => ({ x: peak.x + (x - SUMMIT.x) * kx, y: peak.y + (y - SUMMIT.y) * ky });
        const poly = (pts: [number, number][]) => pts.map(place).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(" ");
        // A little past the foot, so no sliver of sky shows where the first screen ends.
        const ridges = RIDGES.map((r) => poly([[0, 428], ...r.points, [1440, 428]]));
        // The light along the summit ridge's top edge only (stroking the whole shape would also
        // draw its bottom edge, a line where the first screen ends).
        const rim = poly(RIDGES.find((r) => r.rim)!.points);

        // The trail, top down: the summit, the switchbacks, then each marker and out to its
        // side and down past its section, and last the trailhead.
        const margin = W < 640 ? 18 : Math.max(14, Math.min(40, W * 0.04));
        const pts: Pt[] = [place(CAP_BASE), ...[...CLIMB].reverse().map(place)];
        stops.forEach((stop, i) => {
          const m = at(stop.getBoundingClientRect());
          const row = (stop.closest("[data-trail-row]") ?? stop.parentElement)!.getBoundingClientRect();
          const left = i % 2 === 0;
          const side = left ? Math.max(margin, row.left - box.left - 28) : Math.min(W - margin, row.right - box.left + 28);
          pts.push(m);
          pts.push({ x: m.x + (side > m.x ? 1 : -1) * Math.min(70, Math.abs(side - m.x) / 2), y: m.y - 6 });
          pts.push({ x: side, y: m.y + 24 });
          pts.push({ x: side, y: row.bottom - box.top - Math.min(40, row.height * 0.1) });
        });
        const sb = start.getBoundingClientRect();
        const mid = at(sb, 0.5, 0.5);
        const fromRight = pts[pts.length - 1].x > mid.x;
        pts.push({ x: pts[pts.length - 1].x, y: mid.y });
        pts.push(at(sb, fromRight ? 1 : 0, 0.5));
        setShape({ w: W, h: H, trail: smoothPath(pts, margin, W - margin), ridges, rim, cap: poly(CAP) });
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll("[data-trail-summit], [data-trail-row], [data-trail-start]").forEach((n) => ro.observe(n));
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    el.addEventListener("animationend", measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      el.removeEventListener("animationend", measure);
    };
  }, [root]);

  if (!shape) return null;
  return (
    <svg
      aria-hidden="true"
      className="trail-path absolute left-0 top-0 pointer-events-none"
      width={shape.w}
      height={shape.h}
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      style={{ zIndex: 1 }}
    >
      <g opacity={faint ? 0.75 : 1}>
        {shape.ridges.map((points, i) => (
          <g key={i}>
            <polygon points={points} fill={RIDGES[i].fill} fillOpacity={RIDGES[i].opacity} />
            {/* The summit's ridge catches the light along its top edge, so its slopes read against the sky. */}
            {RIDGES[i].rim && <polyline points={shape.rim} fill="none" stroke="rgba(196,187,255,0.28)" strokeWidth={1.5} strokeLinejoin="round" />}
          </g>
        ))}
        <polygon points={shape.cap} fill="#fbbf24" fillOpacity={0.6} />
      </g>
      <path d={shape.trail} fill="none" stroke="rgba(251,191,36,0.10)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <path className="trail-steps" d={shape.trail} fill="none" stroke="#fbbf24" strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 11" />
    </svg>
  );
}
