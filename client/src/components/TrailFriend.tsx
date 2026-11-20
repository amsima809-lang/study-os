/**
 * A friend met at a stop on the landing page's trail: one of the cairn-bots, the family of
 * robots built like the logo's stack of stones (drawn in landing/trailFriends.js). Each stands
 * beside its section's trail marker and gives a small hop the first time it scrolls into view.
 *
 * The drawings are loaded apart from the app, since only the front page shows them; until they
 * arrive the friend's place is kept at its size, so nothing moves when it appears.
 */
import { useEffect, useRef, useState } from "react";
import type { FriendId } from "../landing/trailFriends.js";

type Friends = typeof import("../landing/trailFriends.js").FRIENDS;

/** Each drawing's width on its 100-unit-tall canvas: the place to keep while it loads. */
const WIDTHS: Record<FriendId, number> = {
  guide: 92, planner: 104, timekeeper: 88, listener: 100, scribe: 80, weaver: 124,
  coach: 96, conductor: 92, pathfinder: 88, giftbearer: 100, porter: 92, trailmate: 139,
};

let loading: Promise<Friends> | null = null;
function loadFriends(): Promise<Friends> {
  loading ??= import("../landing/trailFriends.js").then(({ FRIENDS }) => {
    // Their animations, once for the page.
    if (!document.getElementById("tf-styles")) {
      const style = document.createElement("style");
      style.id = "tf-styles";
      style.textContent = FRIENDS.css;
      document.head.appendChild(style);
    }
    return FRIENDS;
  });
  return loading;
}

export function TrailFriend({ id, className = "" }: { id: FriendId; className?: string }) {
  const [friends, setFriends] = useState<Friends | null>(null);
  const [met, setMet] = useState(false);
  const [away, setAway] = useState(false);
  const el = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let alive = true;
    void loadFriends().then((f) => { if (alive) setFriends(f); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // The hop of hello, once, when most of the friend is on screen; after that its small
  // movements go on only while any of it is in sight (twelve friends moving off screen cost
  // a phone as much as the page itself).
  useEffect(() => {
    if (!friends || !el.current) return;
    // The drawings rest on their first frame until met, so a browser that cannot tell is told at once.
    if (typeof IntersectionObserver === "undefined") { setMet(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.intersectionRatio >= 0.6) setMet(true);
      setAway(!e.isIntersecting);
    }, { threshold: [0, 0.6] });
    io.observe(el.current);
    return () => io.disconnect();
  }, [friends]);

  const drawing = friends?.list.find((f) => f.id === id);
  const w = drawing?.w ?? WIDTHS[id];
  return (
    <svg
      ref={el}
      aria-hidden="true"
      viewBox={`0 0 ${w} 100`}
      className={`tf-friend shrink-0 h-16 md:h-[88px] w-auto ${met ? "tf-met " : ""}${away ? "tf-away " : ""}${className}`}
      style={{ aspectRatio: `${w} / 100`, overflow: "visible" }}
      // Our own drawing (landing/trailFriends.js): no visitor's text is in it.
      dangerouslySetInnerHTML={drawing ? { __html: drawing.svg } : undefined}
    />
  );
}
