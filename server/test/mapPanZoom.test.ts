import { describe, it, expect } from "vitest";
import { anchoredScroll, clampZoom, wheelFactor } from "../../client/src/maps/panZoomMath.js";

describe("zooming the campus map about a point", () => {
  it("keeps the point under the cursor where it was", () => {
    // Box scrolled 100px in, cursor 50px from its left: drawing point 150 at scale 1.
    const left = anchoredScroll(100, 50, 1, 2);
    // At scale 2 that drawing point is at 300; it must still be 50px from the box's edge.
    expect(left + 50).toBe(300);
    expect(anchoredScroll(left, 50, 2, 1)).toBe(100); // and zooming back returns
  });

  it("zooms about the middle when no point is given (the buttons)", () => {
    expect(anchoredScroll(0, 200, 1, 1.5)).toBe(100);
  });

  it("stays between the smallest and largest zoom", () => {
    expect(clampZoom(0.4, 1, 5)).toBe(1);
    expect(clampZoom(9, 1, 5)).toBe(5);
    expect(clampZoom(2.2, 1, 5)).toBe(2.2);
  });

  it("zooms in when the wheel turns away, out when it turns back, the same amount either way", () => {
    const into = wheelFactor(-100, 0, false), out = wheelFactor(100, 0, false);
    expect(into).toBeGreaterThan(1);
    expect(out).toBeLessThan(1);
    expect(into * out).toBeCloseTo(1, 10);
  });

  it("treats a wheel that counts in lines like the same distance in pixels", () => {
    expect(wheelFactor(3, 1, false)).toBeCloseTo(wheelFactor(48, 0, false), 10);
  });

  it("makes a trackpad pinch (Ctrl + wheel, small steps) count for more than a wheel notch", () => {
    expect(wheelFactor(-10, 0, true)).toBeGreaterThan(wheelFactor(-10, 0, false));
  });
});
