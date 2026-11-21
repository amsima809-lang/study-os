// End-to-end check of notifications when the app is closed, against a REAL push
// service, in a throwaway Chrome profile (never your own profile).
//
// What it proves: the built app subscribes through its own button, the server's
// test push arrives, a reminder made due is shown AFTER the app's tab is closed,
// it is not announced twice, and turning it off unsubscribes.
//
// How to run (macOS, Google Chrome installed):
//   1. npm run build
//   2. npm run dev                       (the API on :3100, with dev login)
//   3. cd client && npx vite preview --port 4174 --strictPort   (the built app + service worker, /api proxied to :3100)
//   4. node scripts/push-e2e.mjs /tmp/studyos-push-profile headed
// Use "headed": headless Chrome cannot register with a push service.
// It signs in as push-e2e@studyos.test and deletes the reminder it makes.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const [profile, mode = "headless"] = process.argv.slice(2);
const ORIGIN = "http://localhost:4174";
const PORT = 9337;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "--no-first-run", "--no-default-browser-check",
  "--disable-sync", "--window-size=420,820", "--window-position=40,40",
  ...(mode === "headless" ? ["--headless=new"] : []), "about:blank",
], { stdio: "ignore" });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let ws, nextId = 1;
const waiting = new Map();
function send(method, params = {}, sessionId) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject, method }));
}
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && waiting.has(d.id)) {
          const w = waiting.get(d.id); waiting.delete(d.id);
          d.error ? w.reject(new Error(`${w.method}: ${d.error.message}`)) : w.resolve(d.result);
        }
      };
      return v.Browser;
    } catch { await sleep(250); }
  }
  throw new Error("Chrome did not start");
}
async function openTab(url) {
  const { targetId } = await send("Target.createTarget", { url });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  return { targetId, sessionId };
}
async function run(tab, expression) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true }, tab.sessionId);
  if (r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
}

let failed = false;
const check = (name, ok, detail = "") => { log(ok ? "PASS" : "FAIL", name, detail); if (!ok) failed = true; };

try {
  log("browser:", await connect(), `(${mode})`);
  await send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["notifications"] });

  // 1. Sign in with a test account and let the service worker take control.
  let tab = await openTab(ORIGIN + "/");
  await sleep(2500);
  await run(tab, `await fetch('/api/auth/dev-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'push-e2e@studyos.test',name:'Push E2E'})}); localStorage.setItem('studyos.lang','en'); localStorage.setItem('studyos.clock','12'); location.reload();`).catch(() => {});
  await sleep(3000);
  const state = await run(tab, `const reg = await navigator.serviceWorker.ready; for (let i=0;i<30 && !navigator.serviceWorker.controller;i++) await new Promise(r=>setTimeout(r,300)); const me = await (await fetch('/api/auth/me')).json(); return { sw: reg.active.state, controlled: !!navigator.serviceWorker.controller, me: me && me.email, onboarded: me && me.onboarded, permission: Notification.permission };`);
  log("state:", JSON.stringify(state));
  check("service worker active, signed in, permission granted", state.sw === "activated" && state.me === "push-e2e@studyos.test" && state.permission === "granted");
  if (!state.onboarded) {
    await run(tab, `await fetch('/api/profile',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({university_id:'cmu'})}); location.reload();`).catch(() => {});
    await sleep(3000);
  }

  // 2. Turn it on through the app's own button.
  const on = await run(tab, `const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); window.dispatchEvent(new CustomEvent('studyos:navigate',{detail:'reminders'})); await wait(1500);
    const find=(re)=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent));
    const btn=find(/Notify me when the app is closed/); if(!btn) return { error: 'no turn-on button', text: document.body.innerText.slice(0,400) };
    btn.click(); await wait(400); const busyText=[...document.querySelectorAll('button')].some(b=>/Turning on/.test(b.textContent)); for (let i=0;i<300 && !find(/Send a test notification/);i++) await wait(300); window.__busyText=busyText;
    const reg=await navigator.serviceWorker.getRegistration(); const sub=await reg.pushManager.getSubscription();
    return { busyTextShown: window.__busyText, uiOn: !!find(/Send a test notification/), host: sub && new URL(sub.endpoint).host, note: [...document.querySelectorAll('[role=status]')].map(e=>e.textContent).join('|') };`);
  log("turn on:", JSON.stringify(on));
  check("subscribed with a real push service, and the app shows it as on", on.uiOn === true && !!on.host, on.host ?? on.error ?? on.note);
  if (!on.host) throw new Error("no subscription: cannot continue");

  // 3. The test button: server -> push service -> this browser -> service worker -> notification.
  const test = await run(tab, `const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); const find=(re)=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent)); find(/Send a test notification/).click();
    const reg=await navigator.serviceWorker.getRegistration(); let got=null;
    for (let i=0;i<60 && !got;i++) { await wait(500); got=(await reg.getNotifications()).find(n=>n.tag==='studyos-test'); }
    const note=[...document.querySelectorAll('[role=status]')].map(e=>e.textContent).join('|');
    const out={ note, shown: got && { title: got.title, body: got.body, tag: got.tag } }; if (got) got.close(); return out;`);
  log("test push:", JSON.stringify(test));
  check("test notification arrived through the push service", !!test.shown && test.shown.body === "Notifications are working.", test.note);

  // 4. A real reminder, with the app CLOSED: make one due this minute, close the tab, wait for the server's round.
  const made = await run(tab, `const now=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());
    const r=await fetch('/api/reminders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'reminder',title:'E2E closed-app reminder',date:day,time:now,course_code:null,note:'Bring ID card',repeat:'none'})}); const j=await r.json(); return { id:j.id, day, now, status:r.status };`);
  log("reminder made:", JSON.stringify(made));
  await send("Target.closeTarget", { targetId: tab.targetId });
  log("app tab closed; waiting for the server's half-minute round…");

  // Look from a page that is NOT the app (same origin, but no app code runs there), so only a push can have shown it.
  const probe = await openTab(ORIGIN + "/manifest.webmanifest");
  const wanted = `studyos-${made.id}-${made.day}`;
  const shown = await run(probe, `const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); const reg=await navigator.serviceWorker.getRegistration('/'); let got=null; let waited=0;
    for (; waited<90 && !got; waited++) { await wait(1000); got=(await reg.getNotifications()).find(n=>n.tag===${JSON.stringify(wanted)}); }
    const all=(await reg.getNotifications()).map(n=>n.tag); const out={ waited, all, shown: got && { title: got.title, body: got.body, tag: got.tag } }; if (got) got.close(); return out;`);
  log("closed-app reminder:", JSON.stringify(shown));
  check("the reminder was shown while the app was closed", !!shown.shown && shown.shown.title === "E2E closed-app reminder");
  check("its text uses the student's AM/PM setting and note", !!shown.shown && /^\d{1,2}:\d{2} (AM|PM) · Bring ID card$/.test(shown.shown.body), shown.shown?.body);

  // 5. No repeat on later rounds.
  await sleep(40000);
  const again = await run(probe, `const reg=await navigator.serviceWorker.getRegistration('/'); return (await reg.getNotifications()).map(n=>n.tag);`);
  check("not announced a second time", !again.includes(wanted), JSON.stringify(again));

  // 6. Turn it off through the app, and clean up the test data.
  tab = await openTab(ORIGIN + "/");
  await sleep(3000);
  const off = await run(tab, `const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); await fetch('/api/reminders/${made.id}',{method:'DELETE'}); window.dispatchEvent(new CustomEvent('studyos:navigate',{detail:'reminders'})); await wait(1500);
    const find=(re)=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent)); find(/^Turn off$/)?.click(); for (let i=0;i<30 && !find(/Notify me when the app is closed/);i++) await wait(300);
    const reg=await navigator.serviceWorker.getRegistration(); const sub=await reg.pushManager.getSubscription();
    const t=await fetch('/api/push/test',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); return { uiOff: !!find(/Notify me when the app is closed/), stillSubscribed: !!sub, serverSays: t.status };`);
  log("turn off:", JSON.stringify(off));
  check("turned off: browser unsubscribed and the server has no device left", off.uiOff && !off.stillSubscribed && off.serverSays === 409);
} catch (err) {
  failed = true;
  log("ERROR", err.message);
} finally {
  try { await send("Browser.close"); } catch { chrome.kill(); }
  await sleep(500);
  log(failed ? "RESULT: FAILED" : "RESULT: ALL PASSED");
  process.exit(failed ? 1 : 0);
}
