/**
 * Work that would really be LOST by leaving the screen — not work that is
 * safely kept as a draft. Whatever holds such work registers a reason here;
 * the app shell asks before switching screens, and the browser asks before the
 * page is closed or reloaded.
 *
 * Today that is: a note whose draft could not be stored on this device
 * (storage blocked or full), and a quiz that is still being generated.
 */
const reasons = new Map<string, string>();

/** Register (or, with null, clear) a reason. `messageKey` is an i18n key. */
export function setUnsaved(key: string, messageKey: string | null): void {
  if (messageKey) reasons.set(key, messageKey);
  else reasons.delete(key);
}

/** The i18n key of the first thing that would be lost, or null when leaving is safe. */
export function unsavedReason(): string | null {
  return reasons.values().next().value ?? null;
}
