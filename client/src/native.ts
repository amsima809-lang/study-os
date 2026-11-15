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

/**
 * Signing in with Google from inside the iPhone app.
 *
 * Google refuses a sign-in inside an app's web view, so the app has a small plugin
 * (native/ios/App/App/AppSignIn.swift) that opens the sign-in in the system's own
 * sign-in sheet. The sheet is another browser, so it cannot hand over a session:
 * it comes back with a one-time code, and this page exchanges the code for its
 * own session. The verifier made here never leaves the page until that exchange,
 * so the code is no use to anyone else (server/src/appSignIn.ts).
 */
interface AppSignInPlugin {
  start(options: { url: string }): Promise<{ url: string }>;
}

function appSignInPlugin(): AppSignInPlugin | null {
  try {
    const plugin = (window as { Capacitor?: { Plugins?: { AppSignIn?: AppSignInPlugin } } }).Capacitor?.Plugins?.AppSignIn;
    return plugin && typeof plugin.start === "function" ? plugin : null;
  } catch {
    return null;
  }
}

/** False in a browser, and in a copy of the app from before it could do this. */
export function canGoogleSignInInApp(): boolean {
  return appSignInPlugin() !== null;
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** "cancelled" when the student closed the sheet; throws when the sign-in did not finish. */
export async function googleSignInInApp(
  startAddress: (challenge: string) => string,
  redeem: (code: string, verifier: string) => Promise<unknown>,
): Promise<"done" | "cancelled"> {
  const plugin = appSignInPlugin();
  if (!plugin) throw new Error("the app cannot open a sign-in sheet");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  let back: string;
  try {
    back = (await plugin.start({ url: startAddress(challenge) })).url;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "CANCELLED") return "cancelled";
    throw err;
  }
  const code = new URL(back).searchParams.get("code");
  if (!code) throw new Error("the sign-in did not finish");
  await redeem(code, verifier);
  return "done";
}
