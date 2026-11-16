import sharp from "sharp";
import { z } from "zod";
import type { SketchCall } from "./sketchModel.js";
import { Box, type Bounds, type SketchReading } from "./sketchSchema.js";

type RGB = [number, number, number];
const lightness = ([r, g, b]: RGB) => 0.213 * r + 0.715 * g + 0.072 * b;
const rgb = (hex: string): RGB => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as RGB;

/** Read ink from the darkest marks inside a highlighted word. A neutral dark pen stays neutral. */
export async function sampleColour(
  image: Buffer,
  bounds: Bounds,
  width: number,
  height: number,
  highlight: string,
) {
  const [l, t, r, b] = bounds.map((n, i) => (n * (i % 2 ? height : width)) / 1000);
  if (r <= l || b <= t) return null;
  // Coordinates on a whole page are approximate. A margin plus a test for the actual
  // highlighter next to each stroke keeps adjacent dark lettering out of the sample.
  const margin = Math.min(120, Math.ceil(Math.max(width, height) * 0.09));
  const left = Math.max(0, Math.floor(l - margin)),
    top = Math.max(0, Math.floor(t - margin));
  const right = Math.min(width, Math.ceil(r + margin)),
    bottom = Math.min(height, Math.ceil(b + margin));
  if (right <= left || bottom <= top) return null;
  const { data, info } = await sharp(image)
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize({ width: 180, height: 180, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const marker = rgb(highlight),
    paper = lightness(marker);
  function onMarker(x: number, y: number) {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return false;
    const offset = (y * info.width + x) * 3;
    return marker.every((v, i) => Math.abs(data[offset + i] - v) < 65);
  }
  const candidates: RGB[] = [];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      const pixel: RGB = [data[i], data[i + 1], data[i + 2]];
      if (lightness(pixel) >= Math.min(paper - 48, 135)) continue;
      if (onMarker(x - 4, y) || onMarker(x + 4, y) || onMarker(x, y - 4) || onMarker(x, y + 4))
        candidates.push(pixel);
    }
  if (candidates.length < 6) return null;
  candidates.sort((a, b) => lightness(a) - lightness(b));
  const dark = candidates.slice(0, Math.max(6, Math.ceil(candidates.length * 0.45)));
  const result: RGB = [0, 1, 2].map(
    (channel) => dark.map((p) => p[channel]).sort((a, b) => a - b)[Math.floor(dark.length / 2)],
  ) as RGB;
  // A tinted JPEG fringe or model crop containing unrelated black lettering is insufficient evidence.
  const spread = Math.max(...result) - Math.min(...result);
  if (spread < 48 || spread / Math.max(...result) < 0.38) return null;
  return "#" + result.map((n) => n.toString(16).padStart(2, "0")).join("");
}

export async function checkHighlightColours(
  call: SketchCall,
  image: Buffer,
  width: number,
  height: number,
  reading: SketchReading,
) {
  const candidates = reading.items
    .filter(
      (item) => item.highlight && item.text.trim() && item.text.length <= 64 && Math.max(...rgb(item.ink)) <= 75,
    )
    .slice(0, 40);
  if (!candidates.length) return new Map<string, string>();
  const words = candidates.map(({ id, text, highlight }) => ({ id, text, highlight }));
  const locations = z
    .object({ words: z.array(z.object({ id: z.string(), box: Box })).max(40) })
    .parse(
      await call(
        "sketch_ink",
        `Locate the exact highlighted words or numbered markers in this page: ${JSON.stringify(words)}. Return tight boxes around the writing, including its coloured background. Use coordinates normalized to 0..1000 within the whole image (independently for each axis). If uncertain, omit that word. JSON {"words":[{"id":"B1","box":[left,top,right,bottom]}]}.`,
        [image],
        "high",
      ),
    );
  const colors = new Map<string, string>();
  for (const location of locations.words) {
    const item = candidates.find((i) => i.id === location.id);
    if (!item?.highlight) continue;
    const measured = await sampleColour(image, location.box, width, height, item.highlight);
    if (measured) {
      // Nearby samples can be from the same pen. Keep a stable palette across the page.
      const prev = [...colors.values()].find((color) =>
        rgb(color).every((v, i) => Math.abs(v - rgb(measured)[i]) < 22),
      );
      colors.set(item.id, prev ?? measured);
    }
  }
  return colors;
}

export function applyHighlightColours(reading: SketchReading, colors: Map<string, string>) {
  for (const item of reading.items) {
    const color = colors.get(item.id);
    if (!color) continue;
    for (const block of reading.notes.blocks) {
      if (block.type !== "text" && block.type !== "heading") continue;
      for (const run of block.runs) {
        if (run.text.trim() === item.text.trim() && run.highlight === item.highlight && run.ink === item.ink)
          run.ink = color;
      }
    }
    item.ink = color;
  }
}
