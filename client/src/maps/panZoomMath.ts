/** The arithmetic of panning and zooming the campus maps (panZoom.ts), kept apart so it can be tested without a browser. */

/** How far (in pixels) a pointer may move and still count as a tap. */
export const TAP_SLOP = 6;

export function clampZoom(z: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, z));
}

/**
 * The scroll position that keeps the point at `anchor` (pixels from the box's top-left) on
 * the same spot of the drawing when its scale goes from `from` to `to`.
 */
export function anchoredScroll(scroll: number, anchor: number, from: number, to: number): number {
  return ((scroll + anchor) * to) / from - anchor;
}

/** The zoom factor for one wheel event. A trackpad pinch (Ctrl) is finer, so it counts more. */
export function wheelFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-px * (ctrlKey ? 0.01 : 0.0015));
}
