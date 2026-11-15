/**
 * Pan and zoom for the campus maps.
 *
 * The map sits in a box (`scroller`) that clips it; the drawing inside (`content`) is as wide
 * as the box times the zoom, and its height follows. Panning moves the box's scroll position
 * (the box does not scroll by itself: it is `overflow: hidden`), and zooming changes the
 * drawing's width, with the scroll position moved so that the point under the cursor or
 * between the fingers stays put.
 *
 * On a phone one finger belongs to the page, as everywhere else in the app, so a student
 * scrolling down the screen is not caught by the map:
 *  - one finger: scrolls the page; a tap still selects a building
 *  - two fingers: move the map, and pinch to zoom it
 * With a mouse or trackpad:
 *  - drag: move the map; a click that does not move still selects a building
 *  - wheel, or a trackpad pinch (which browsers report as a wheel with Ctrl): zoom
 * And the + and − buttons zoom about the middle of the box.
 *
 * `touch-action: pan-x pan-y` (maps.css) lets one finger scroll the page and keeps the
 * browser from zooming the whole page when two fingers are on the map.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { anchoredScroll, clampZoom, wheelFactor, TAP_SLOP } from "./panZoomMath.ts";

interface Options {
  min: number;
  max: number;
  initial: number;
}

export function usePanZoom({ min, max, initial }: Options) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(initial);
  // For the buttons (disabled at either end). The drawing itself is resized directly, not
  // through React, so a pinch does not re-render the screen on every movement.
  const [zoom, setZoomState] = useState(initial);

  const apply = useCallback(
    (next: number, anchorX?: number, anchorY?: number) => {
      const box = scroller.current, inner = content.current;
      if (!box || !inner) return;
      const to = clampZoom(next, min, max), from = zoomRef.current;
      if (Math.abs(to - from) < 1e-4) return;
      const ax = anchorX ?? box.clientWidth / 2, ay = anchorY ?? box.clientHeight / 2;
      const left = anchoredScroll(box.scrollLeft, ax, from, to);
      const top = anchoredScroll(box.scrollTop, ay, from, to);
      zoomRef.current = to;
      inner.style.width = `${to * 100}%`;
      box.scrollLeft = left;
      box.scrollTop = top;
      setZoomState(to);
    },
    [min, max],
  );

  // The starting width, before the first paint.
  useEffect(() => {
    if (content.current) content.current.style.width = `${zoomRef.current * 100}%`;
  }, []);

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const at = (e: { clientX: number; clientY: number }) => {
      const r = box.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // Set when a drag or a two-finger gesture has moved: the click that may follow must not
    // select a building.
    let moved = false;

    // Wheel: a non-passive listener, to stop the page scrolling instead.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = at(e);
      if (e.deltaY !== 0) apply(zoomRef.current * wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey), p.x, p.y);
      if (e.deltaX !== 0 && !e.ctrlKey) box.scrollLeft += e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    };

    // Mouse (and pen): drag to move the map. Touch is handled below.
    let drag: { id: number; start: { x: number; y: number }; last: { x: number; y: number } } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      const p = at(e);
      drag = { id: e.pointerId, start: p, last: p };
      moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = at(e);
      if (!moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < TAP_SLOP) return;
      if (!moved) {
        moved = true;
        // Only now: capturing at once would send a plain click to the box, not the building.
        box.setPointerCapture?.(e.pointerId);
        box.classList.add("is-panning");
      }
      box.scrollLeft -= p.x - drag.last.x;
      box.scrollTop -= p.y - drag.last.y;
      drag.last = p;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      box.releasePointerCapture?.(e.pointerId);
      box.classList.remove("is-panning");
      drag = null;
    };

    // Touch: two fingers move and pinch the map; one finger is left to the page.
    let pinch: { dist: number; mid: { x: number; y: number } } | null = null;
    const spread = (t: TouchList) => {
      const a = at(t[0]), b = at(t[1]);
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinch = spread(e.touches);
        moved = true;
      } else if (e.touches.length === 1) {
        moved = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2 || !pinch) return;
      e.preventDefault();
      const now = spread(e.touches);
      if (pinch.dist > 0) apply(zoomRef.current * (now.dist / pinch.dist), now.mid.x, now.mid.y);
      box.scrollLeft -= now.mid.x - pinch.mid.x;
      box.scrollTop -= now.mid.y - pinch.mid.y;
      pinch = now;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    // Safari's own page zoom, which it starts on two fingers whatever touch-action says.
    const onGesture = (e: Event) => e.preventDefault();

    // A drag or a pinch ends with a click on whatever is under it: not a selection.
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointercancel", onUp);
    box.addEventListener("touchstart", onTouchStart, { passive: false });
    box.addEventListener("touchmove", onTouchMove, { passive: false });
    box.addEventListener("touchend", onTouchEnd);
    box.addEventListener("touchcancel", onTouchEnd);
    box.addEventListener("gesturestart", onGesture);
    box.addEventListener("click", onClick, true);
    return () => {
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
      box.removeEventListener("touchstart", onTouchStart);
      box.removeEventListener("touchmove", onTouchMove);
      box.removeEventListener("touchend", onTouchEnd);
      box.removeEventListener("touchcancel", onTouchEnd);
      box.removeEventListener("gesturestart", onGesture);
      box.removeEventListener("click", onClick, true);
    };
  }, [apply]);

  return {
    scroller,
    content,
    zoom,
    /** Zoom by a factor about the middle of the box (the + and − buttons). */
    zoomBy: (factor: number) => apply(zoomRef.current * factor),
    atMin: zoom <= min + 1e-3,
    atMax: zoom >= max - 1e-3,
  };
}
