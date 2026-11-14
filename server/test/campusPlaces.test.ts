import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { nextClassDay } from "../src/api.js";
// (Typed by hand: a type import would pull browser-only code into the server's typecheck.)
type CampusId = "huamak" | "bangna";
type Place = { lat: number; lon: number };
const { placeOf, positionOf, positionOfRoom, directionsUrl, onDrawing } = (await import(
  new URL("../../client/src/maps/locate.ts", import.meta.url).href
)) as {
  placeOf: (room: string | null) => { campus: CampusId; code: string } | null;
  positionOf: (campus: CampusId, code: string) => Place | null;
  positionOfRoom: (room: string | null) => Place | null;
  directionsUrl: (to: Place) => string;
  onDrawing: (campus: CampusId, lat: number, lon: number, fixAccuracy?: number) => { x: number; y: number; radius: number; inside: boolean; metresAway: number };
};
const { CODES, PLACES, GROUND } = (await import(new URL("../../client/src/maps/places.ts", import.meta.url).href)) as {
  CODES: Record<CampusId, string[]>;
  PLACES: Record<CampusId, Record<string, Place>>;
  GROUND: Record<CampusId, { accuracy: number; unit: number }>;
};

const CAMPUSES: CampusId[] = ["huamak", "bangna"];
const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 110574, (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180));

describe("Phase 60 — from a room to a building", () => {
  it("reads the building out of a room as the registrar writes it", () => {
    expect(placeOf("KTB 301")).toEqual({ campus: "bangna", code: "KTB" });
    expect(placeOf("SBB 201")).toEqual({ campus: "huamak", code: "SBB" });
    expect(placeOf("BPB302")).toEqual({ campus: "huamak", code: "BPB" }); // no space
    expect(placeOf("SKB 416")).toEqual({ campus: "huamak", code: "SKB" }); // not SK
    expect(placeOf("LOB 201")).toEqual({ campus: "huamak", code: "LOB" }); // not LOB2
    expect(placeOf("ห้องปฏิบัติการ คอมพิวเตอร์ VKB ชั้น 2 ITSC6")).toEqual({ campus: "huamak", code: "VKB" });
  });

  it("takes a numbered building's number from the room: SK 1401 is in SK1, GB 4 is GB4", () => {
    expect(placeOf("SK 1401")).toEqual({ campus: "bangna", code: "SK1" });
    expect(placeOf("SK 1602")).toEqual({ campus: "bangna", code: "SK1" });
    expect(placeOf("GB 4")).toEqual({ campus: "huamak", code: "GB4" });
  });

  it("gives nothing for a room in no building on the maps", () => {
    expect(placeOf(null)).toBeNull();
    expect(placeOf("")).toBeNull();
    expect(placeOf("XYZ 101")).toBeNull();
    expect(positionOfRoom("XYZ 101")).toBeNull();
  });
});

describe("Phase 60 — where the buildings are", () => {
  it("every located building is one that is drawn, sits on its own campus, and has its own position", () => {
    const BOX = { huamak: [13.7515, 13.7605, 100.614, 100.6235], bangna: [13.665, 13.6695, 100.683, 100.6905] };
    for (const c of CAMPUSES) {
      const [s, n, w, e] = BOX[c];
      const seen = new Set<string>();
      for (const [code, p] of Object.entries(PLACES[c])) {
        expect(CODES[c], `${code} is drawn`).toContain(code);
        expect(p.lat > s && p.lat < n && p.lon > w && p.lon < e, `${code} is on the ${c} campus`).toBe(true);
        const key = `${p.lat},${p.lon}`;
        expect(seen.has(key), `${code} shares a position`).toBe(false);
        seen.add(key);
      }
    }
    expect(Object.keys(PLACES.bangna).sort()).toEqual([...CODES.bangna].sort()); // all of Bang Na
    expect(Object.keys(PLACES.huamak).length).toBe(32);
  });

  it("leaves out the two buildings the sources disagree about", () => {
    expect(positionOf("huamak", "SLB")).toBeNull();
    expect(positionOf("huamak", "SLL")).toBeNull();
  });

  it("the two campuses are where they should be relative to each other: about 12 km apart", () => {
    const d = metres(PLACES.huamak.SBB, PLACES.bangna.KTB);
    expect(d).toBeGreaterThan(11_000);
    expect(d).toBeLessThan(13_500);
  });

  describe("this term's classes", () => {
    let db: DB;
    beforeAll(() => { db = openDb(":memory:"); seedDatabase(db, { reset: false }); });

    it("every class in the catalogue is in a building with a confirmed position", () => {
      const rooms = (db.prepare("SELECT DISTINCT room FROM class_sessions WHERE term_id = '2/69' AND room IS NOT NULL AND room <> ''").all() as { room: string }[]).map((r) => r.room);
      expect(rooms.length).toBeGreaterThan(40);
      const lost = rooms.filter((r) => !positionOfRoom(r));
      expect(lost).toEqual([]);
    });

    it("first-year classes (Bang Na) and the rest (Hua Mak) land on the right campus", () => {
      const at = (code: string) => placeOf((db.prepare("SELECT room FROM class_sessions WHERE term_id = '2/69' AND course_code = ?").get(code) as { room: string }).room)?.campus;
      expect(at("RAM1111")).toBe("bangna");
      expect(at("ACC1103")).toBe("bangna");
      expect(at("MKT2101")).toBe("huamak");
    });
  });
});

describe("Phase 60 — walking directions and 'where am I'", () => {
  it("links to Google Maps walking directions with the destination only: never the student's own position", () => {
    const url = new URL(directionsUrl(PLACES.bangna.KTB));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ api: "1", destination: `${PLACES.bangna.KTB.lat},${PLACES.bangna.KTB.lon}`, travelmode: "walking" });
  });

  it("puts a position on the drawing near the building that stands there", () => {
    // Standing at each located building: the mark falls on the drawing, and the building's own
    // drawn centre is within about twice the drawing's stated error for nearly all of them.
    for (const c of CAMPUSES) {
      const spots = Object.values(PLACES[c]).map((p) => onDrawing(c, p.lat, p.lon));
      expect(spots.every((s) => s.inside), c).toBe(true);
      expect(spots.every((s) => s.radius * GROUND[c].unit === GROUND[c].accuracy)).toBe(true);
    }
    // a good phone fix never makes the mark more certain than the drawing; a poor one widens it
    expect(onDrawing("bangna", PLACES.bangna.KTB.lat, PLACES.bangna.KTB.lon, 5).radius * GROUND.bangna.unit).toBeCloseTo(GROUND.bangna.accuracy);
    expect(onDrawing("bangna", PLACES.bangna.KTB.lat, PLACES.bangna.KTB.lon, 120).radius * GROUND.bangna.unit).toBeCloseTo(120);
  });

  it("knows when she is not on the campus, and how far away it is", () => {
    const victoryMonument = { lat: 13.7649, lon: 100.5383 };
    for (const c of CAMPUSES) expect(onDrawing(c, victoryMonument.lat, victoryMonument.lon).inside).toBe(false);
    expect(onDrawing("huamak", victoryMonument.lat, victoryMonument.lon).metresAway).toBeGreaterThan(8000);
    // standing at Bang Na she is on that drawing, and not on Hua Mak's
    expect(onDrawing("bangna", PLACES.bangna.SK1.lat, PLACES.bangna.SK1.lon).inside).toBe(true);
    expect(onDrawing("huamak", PLACES.bangna.SK1.lat, PLACES.bangna.SK1.lon).inside).toBe(false);
  });
});

describe("Phase 60 — the next day with classes", () => {
  const classes = [{ weekday: 1, c: "A" }, { weekday: 1, c: "B" }, { weekday: 4, c: "C" }];
  it("finds the next day of the week that has any, going round the weekend", () => {
    expect(nextClassDay(classes, 2)).toEqual({ weekday: 4, classes: [{ weekday: 4, c: "C" }] });
    expect(nextClassDay(classes, 4)?.weekday).toBe(1); // Thursday -> next Monday
    expect(nextClassDay(classes, 7)?.classes.map((x) => x.c)).toEqual(["A", "B"]);
  });
  it("has nothing to say when no other day has a class", () => {
    expect(nextClassDay([], 3)).toBeNull();
    expect(nextClassDay([{ weekday: 3 }], 3)).toBeNull();
  });
});
