/**
 * The two campus drawings and what is on them, shared by the Campus map screen and the
 * room sheet (components/RoomMap.tsx).
 */
import huamak from "./ru-huamak.svg?raw";
import bangna from "./ru-bangna.svg?raw";
import type { CampusId } from "./places.ts";

export const CAMPUSES: Record<CampusId, { svg: string; label: string }> = {
  huamak: { svg: huamak, label: "map.huamak" },
  bangna: { svg: bangna, label: "map.bangna" },
};

/** Every building on a map: its code, and its name where the map carries one. */
function buildingsOf(svg: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of svg.matchAll(/<g id="([A-Z0-9]+)" data-code="\1">(?:<title>([^<]*)<\/title>)?/g)) {
    out.set(m[1], (m[2] ?? "").replace(/^[A-Z0-9]+ · /, "").replace(/&amp;/g, "&"));
  }
  return out;
}

export const BUILDINGS: Record<CampusId, Map<string, string>> = { huamak: buildingsOf(huamak), bangna: buildingsOf(bangna) };
