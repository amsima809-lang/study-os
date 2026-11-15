// Screenshots of the app for the front page (client/src/components/Landing.tsx), taken from a
// running copy of the app in a throwaway headless Chrome, at iPhone size and twice the pixels.
//
//   node scripts/landing-shots.mjs http://127.0.0.1:3178
//
// The copy must offer the dev login (no Google client): the script signs in as
// landing-shots@termtrail.test, chooses Ramkhamhaeng, Business Administration, Marketing,
// admission 2569 if that account is new, picks the trail's courses for this term, and makes a
// study plan. Everything it shows is that made-up student's: never point it at the live site.
//
// It writes client/public/landing/<th|en>/<shot>.webp, in the dark theme.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import sharp from "sharp";

const ORIGIN = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(ORIGIN)) {
  console.error("usage: node scripts/landing-shots.mjs http://127.0.0.1:<port>   (a local copy only)");
  process.exit(1);
}
const OUT = new URL("../client/public/landing/", import.meta.url).pathname;
const PORT = 9338;
const W = 390, H = 844;

const profile = await mkdtemp(join(tmpdir(), "landing-shots-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "--no-first-run", "--no-default-browser-check",
  "--disable-sync", "--headless=new", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

let ws, nextId = 1;
const waiting = new Map();
const send = (method, params = {}, sessionId) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject, method }));
};
for (let i = 0; ; i++) {
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    break;
  } catch { if (i > 40) throw new Error("Chrome did not start"); await sleep(250); }
}
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) {
    const w = waiting.get(d.id); waiting.delete(d.id);
    d.error ? w.reject(new Error(`${w.method}: ${d.error.message}`)) : w.resolve(d.result);
  }
};

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, s);
await send("Page.enable", {}, s);
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: true }, s);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, s);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, s);

const run = async (body) => {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const go = async (url) => { await send("Page.navigate", { url }, s); await sleep(2500); };
/** Let the screen settle: data loaded, slide-in animations finished, fonts drawn. */
const settle = async (ms = 1800) => {
  await sleep(ms);
  await run(`await document.fonts.ready; document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish(); }); return true;`);
  await sleep(300);
};
const shoot = async (lang, name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, s);
  await mkdir(join(OUT, lang), { recursive: true });
  const file = join(OUT, lang, `${name}.webp`);
  await sharp(Buffer.from(data, "base64")).webp({ quality: 82 }).toFile(file);
  console.log("wrote", file.replace(OUT, "client/public/landing/"));
};

// Sign in, and set up the made-up student once.
await go(`${ORIGIN}/`);
await run(`
  const r = await fetch("/api/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "landing-shots@termtrail.test", name: "Student" }) });
  if (!r.ok) throw new Error("dev login refused: start the copy without a Google client");
  localStorage.setItem("studyos-theme", "dark");
  localStorage.setItem("studyos.university", "ru");
  return true;`);
await go(`${ORIGIN}/`);
const needsOnboarding = await run(`return !!document.querySelector('select') && /2569|Get started|เริ่มใช้งาน/.test(document.body.innerText);`);
if (needsOnboarding) {
  await run(`
    const set = (el, v) => { const p = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(p, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    set(document.querySelectorAll('select')[0], "ru"); await wait(600);
    const prog = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === "bus-mkt"));
    set(prog, "bus-mkt"); await wait(300);
    set(document.querySelector('input[type=text]'), "2569"); await wait(300);
    document.querySelector('button[type=submit]').click(); await wait(2500);
    return true;`);
}
await run(`
  const tc = await (await fetch("/api/term-courses")).json();
  if (tc.chosen.length === 0) {
    const sug = await (await fetch("/api/trail/suggested")).json();
    await fetch("/api/term-courses", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ codes: sug.codes }) });
  }
  const plan = await (await fetch("/api/studyplan")).json().catch(() => null);
  if (!plan || !plan.tasks || plan.tasks.length === 0) await fetch("/api/studyplan/generate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  try { sessionStorage.clear(); localStorage.setItem("studyos.coursesPrompted", "2/69"); } catch {}
  return true;`);

const open = (id) => `window.dispatchEvent(new CustomEvent("studyos:navigate", { detail: "${id}" })); await new Promise((r) => setTimeout(r, 1500)); window.scrollTo(0, 0);`;
// Two of today's to-dos for the made-up student, in the language being shot, so Today is not empty.
const TODOS = {
  th: ["อ่าน ACC1103 บทที่ 2", "ทบทวนบัตรทวน RAM1131"],
  en: ["Read ACC1103 chapter 2 before Monday's class", "Review the RAM1131 flashcards"],
};
const todosFor = (lang) => `
  const today = (await (await fetch("/api/today")).json()).today;
  const list = await (await fetch("/api/reminders")).json();
  for (const r of (list.items ?? list.reminders ?? list)) if (r.kind === "todo") await fetch("/api/reminders/" + r.id, { method: "DELETE" });
  for (const title of ${JSON.stringify(TODOS[lang] ?? [])}) await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "todo", title, date: today }) });`;

const SHOTS = [
  // Beside the sign-in card on the front page.
  ["today", `${open("today")} return true;`],
  ["timetable", `${open("timetable")} return true;`],
  // The Campus map screen on the main campus (Hua Mak), the whole campus across so its shape
  // is recognisable, with the Central Library tapped: highlighted, named, walking directions.
  ["map", `${open("map")}
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const huamak = [...document.querySelectorAll("button[aria-pressed]")].find((x) => /^(Hua Mak|หัวหมาก)$/.test(x.innerText.trim()));
    if (!huamak) throw new Error("no Hua Mak button on the Campus map screen");
    huamak.click(); await wait(800);
    const out = document.querySelector('button[aria-label="Zoom out"], button[aria-label="ย่อ"]');
    for (let i = 0; i < 12 && out && !out.disabled; i++) { out.click(); await wait(120); }
    const lib = document.querySelector('.campus-map g[data-code="LIB"]');
    if (!lib) throw new Error("no Central Library on the Hua Mak drawing");
    lib.dispatchEvent(new MouseEvent("click", { bubbles: true })); await wait(1200);
    if (!document.querySelector('.campus-map g[data-code="LIB"] .is-selected')) throw new Error("the library was not selected");
    window.scrollTo(0, 0); await wait(300);
    return true;`],
  ["trail", `${open("trail")} return true;`],
  ["studyplan", `${open("studyplan")} return true;`],
  ["exams", `${open("exams")} return true;`],
];

// The trail starts aimed at the shortest possible graduation, which a new student cannot
// make: aim it at the earliest term the planner says is possible, as a student would.
await run(`localStorage.setItem("studyos.lang", "en"); return true;`);
await go(`${ORIGIN}/`);
await run(`${open("trail")}
  const aim = [...document.querySelectorAll("button")].find((x) => /^Aim for /.test(x.innerText.trim()));
  if (aim) { aim.click(); await new Promise((r) => setTimeout(r, 1500)); }
  return true;`);

for (const lang of ["th", "en"]) {
  await run(`localStorage.setItem("studyos.lang", "${lang}"); ${todosFor(lang)} return true;`);
  await go(`${ORIGIN}/`); // after the to-dos are in, so Today shows them
  for (const [name, action] of SHOTS) {
    // Close a sheet left open by the shot before.
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); return true;`);
    await sleep(400);
    await run(action);
    await settle();
    await shoot(lang, name);
  }
}

await send("Browser.close").catch(() => chrome.kill());
await sleep(500);
await rm(profile, { recursive: true, force: true });
