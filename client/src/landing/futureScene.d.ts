/** What the scene's drawing code is told about the page (see Trail.tsx, which builds it). */
export type SceneApi = {
  /** The page's width and the height of the first screen, in pixels. */
  W: number; H: number;
  phone: boolean;
  /** Pixels per mountain-grid unit, for object sizes (uniform), and the ridges' own stretch. */
  s: number; kx: number; ky: number;
  /** A point on the 1440 x 420 mountain grid, in page pixels. */
  place: (gx: number, gy: number) => { x: number; y: number };
  /** The grid y of a ridge's top edge at grid x (0 the farthest ridge, 2 the nearest). */
  ridgeY: (ridge: number, gx: number) => number;
  /** The grid x at the page's left and right edges. */
  gxMin: number; gxMax: number;
  /** The grid x the trail's switchbacks stay within. */
  trailBand: [number, number];
  /** The summit, and the trail's corners from the foot of the first screen up to the cap, in pixels. */
  peak: { x: number; y: number };
  climb: { x: number; y: number }[];
  /** What stands above the scene: the sign-in column and, on a wide screen, the phone beside it. */
  column: { x: number; y: number; w: number; h: number };
  mock: { x: number; y: number; w: number; h: number } | null;
};
/** SVG markup for each depth of the scene, back to front, and the CSS that animates it. */
export type SceneLayers = { sky?: string; far?: string; mid?: string; near?: string; top?: string; css?: string };
export function drawScene(a: SceneApi): SceneLayers;
