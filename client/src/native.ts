/**
 * Is the app running inside the iOS app (native/), rather than in a browser?
 * The shell puts a `Capacitor` object on every page it shows, before the page's own code runs.
 * The iOS app shows the same web app from the same server, so almost nothing needs to know;
 * use this only for what a web view cannot do (for now: notifications when the app is closed).
 */
export function inNativeApp(): boolean {
  try {
    return (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}
