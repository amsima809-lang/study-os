/**
 * Where the app is served from. At the top of a site this is "" and nothing
 * changes; under a sub-path (for example https://example.com/termtrail, built
 * with BASE_PATH=/termtrail) it is "/termtrail".
 *
 * Every address the app builds itself goes through `withBase`: API calls
 * (client/src/api.ts does it for all of them), links, images.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Turn a path from the top of the app ("/api/today", "/campus/ru.webp") into its real address. */
export const withBase = (path: string): string => (path.startsWith("/") && !path.startsWith("//") ? BASE + path : path);
