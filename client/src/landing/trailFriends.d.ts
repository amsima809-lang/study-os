/** The friends met along the landing page's trail: one drawing each, on a 100-unit-tall canvas. */
export type FriendId =
  | "guide" | "planner" | "timekeeper" | "listener" | "scribe" | "weaver"
  | "coach" | "conductor" | "pathfinder" | "giftbearer" | "porter" | "trailmate";
export const FRIENDS: { css: string; list: { id: FriendId; w: number; h: number; svg: string }[] };
