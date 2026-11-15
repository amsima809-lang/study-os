/**
 * The product's name, for the server's own outward text (the calendar feed's name). A copy of
 * client/src/brand.ts, which the server cannot import: `node scripts/rename-app.mjs` changes both,
 * and server/test/brand.test.ts fails if they differ.
 */
export const APP_NAME = "Termtrail"; // @app-name
export const APP_NAME_TH = "Termtrail"; // @app-name-th
