// Straighten a photo that was taken slightly tilted, in place, keeping its size.
//
//   node scripts/straighten-photo.mjs client/public/campus/ru.webp -1.0
//
// The angle is in degrees; a positive angle turns the picture clockwise. A picture whose
// uprights lean to the right at the top needs a negative angle. The picture is turned about
// its centre and enlarged just enough that no empty corner shows, so a little of each edge
// is lost (about 3% for one degree on a tall picture).
//
// How the angle for the Ramkhamhaeng pavilion was found: the spire and the edges of the red
// columns were traced down the picture; all leaned about one degree the same way. After the
// turn the spire is upright to within 0.05 degrees. The columns on either side still lean
// inwards by up to a degree, as the building's own columns do.
import sharp from "sharp";

const [, , file, angleText] = process.argv;
const angle = Number(angleText);
if (!file || !Number.isFinite(angle) || Math.abs(angle) > 10) {
  console.error("usage: node scripts/straighten-photo.mjs <picture.webp> <degrees, between -10 and 10>");
  process.exit(1);
}

const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const roll = (angle * Math.PI) / 180, cos = Math.cos(roll), sin = Math.sin(roll);
const cx = (W - 1) / 2, cy = (H - 1) / 2;
// The largest upright rectangle of the same proportions that fits inside the turned picture.
const zoom = 1 / (cos + Math.abs(sin) * Math.max(H / W, W / H));
const out = Buffer.alloc(W * H * C);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = (x - cx) * zoom, v = (y - cy) * zoom;
    // Where in the original this pixel comes from, clamped at the very edge.
    const sx = Math.min(W - 1.001, Math.max(0, cx + u * cos + v * sin));
    const sy = Math.min(H - 1.001, Math.max(0, cy - u * sin + v * cos));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const a = (y0 * W + x0) * C, b = a + C, c = a + W * C, d = c + C, o = (y * W + x) * C;
    for (let k = 0; k < C; k++) {
      out[o + k] = Math.round((data[a + k] * (1 - fx) + data[b + k] * fx) * (1 - fy) + (data[c + k] * (1 - fx) + data[d + k] * fx) * fy);
    }
  }
}
await sharp(out, { raw: { width: W, height: H, channels: C } }).webp({ quality: 84 }).toFile(`${file}.tmp`);
const { rename } = await import("node:fs/promises");
await rename(`${file}.tmp`, file);
console.log(`${file}: turned ${angle} degrees, ${W}x${H} kept, enlarged ${(1 / zoom).toFixed(3)}x`);
