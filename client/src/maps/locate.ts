/**
 * From a room to a real place: which building a class is in, where that building is on the
 * ground, and where a position on the ground falls on a campus drawing.
 * The data is generated (places.ts, by scripts/maps/locate.cjs); nothing here is typed by hand.
 */
import { CODES, GROUND, PLACES, type CampusId, type Place } from "./places.ts";

export type { CampusId, Place };

const HAS: Record<CampusId, Set<string>> = { huamak: new Set(CODES.huamak), bangna: new Set(CODES.bangna) };

/**
 * "KTB 201" -> { campus: "bangna", code: "KTB" }; a room in no building on either map -> null.
 * The registrar writes a numbered building's number with the room: "GB 4" is building GB4, and
 * "SK 1401" is taken as building SK1, room 401 (there is no building "SK"; every SK room this
 * term begins with 1, and they are all first-year classes, which are held at Bang Na).
 */
export function placeOf(room: string | null): { campus: CampusId; code: string } | null {
  for (const m of (room ?? "").matchAll(/([A-Z]{2,4})(\d?)(?: ?(\d))?/g)) {
    const [, letters, stuck, next] = m;
    for (const campus of ["bangna", "huamak"] as CampusId[]) {
      for (const code of [letters + stuck, letters, ...(stuck === "" && next ? [letters + next] : [])]) if (HAS[campus].has(code)) return { campus, code };
    }
  }
  return null;
}

/** Where a building is, if its position is confirmed. */
export function positionOf(campus: CampusId, code: string): Place | null {
  return PLACES[campus][code] ?? null;
}

/** The confirmed position of the building a room is in, or null. */
export function positionOfRoom(room: string | null): Place | null {
  const p = placeOf(room);
  return p ? positionOf(p.campus, p.code) : null;
}

/**
 * Walking directions to a place in Google Maps, from wherever the student is. On a phone with
 * the Google Maps app this link opens the app. Only the destination is in the link; Google Maps
 * works out where she is by itself.
 *
 * `start`: begin the walk at once (Google's `dir_action=navigate`): on a phone, turn-by-turn
 * navigation starts from her position instead of a list of routes to choose from. A computer
 * shows the route.
 */
export function directionsUrl(to: Place, { start = false }: { start?: boolean } = {}): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lon}&travelmode=walking${start ? "&dir_action=navigate" : ""}`;
}

/**
 * The address of a Google map to show inside the app (Maps Embed API). With `from` it is the
 * walking route from there to the place; without, the place alone. `from` is the student's own
 * position: it goes from her browser to Google as part of this address, and nowhere else.
 */
export function embedUrl(key: string, to: Place, from: Place | null, lang: "th" | "en"): string {
  const q = new URLSearchParams({ key });
  if (from) { q.set("origin", `${from.lat},${from.lon}`); q.set("destination", `${to.lat},${to.lon}`); q.set("mode", "walking"); }
  else { q.set("q", `${to.lat},${to.lon}`); q.set("zoom", "18"); }
  q.set("language", lang);
  q.set("region", "TH");
  return `https://www.google.com/maps/embed/v1/${from ? "directions" : "place"}?${q}`;
}

/**
 * Where a position on the ground falls on a campus drawing. `inside` is false when it is off
 * the drawing (the student is not on that campus); `metresAway` is then how far the campus is.
 * `radius` is how uncertain the mark is, in drawing units: the drawings are sketches, so it is
 * never smaller than the drawing's own error, however good the phone's fix.
 */
export function onDrawing(campus: CampusId, lat: number, lon: number, fixAccuracy = 0): { x: number; y: number; radius: number; inside: boolean; metresAway: number } {
  const g = GROUND[campus];
  const east = (lon - g.ref[1]) * 111320 * Math.cos((g.ref[0] * Math.PI) / 180);
  const north = (lat - g.ref[0]) * 110574;
  const x = g.f[0] * east + g.f[1] * north + g.f[2];
  const y = g.f[3] * east + g.f[4] * north + g.f[5];
  const [bx, by, bw, bh] = g.box;
  return {
    x, y,
    radius: Math.max(fixAccuracy, g.accuracy) / g.unit,
    inside: x >= bx && x <= bx + bw && y >= by && y <= by + bh,
    metresAway: Math.hypot(east, north),
  };
}
