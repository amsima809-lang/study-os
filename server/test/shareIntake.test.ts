import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Client logic, tested here because the client has no test runner of its own.
const { sharedBody, sortShared } = (await import(new URL("../../client/src/shareIntake.ts", import.meta.url).href)) as {
  sharedBody: (s: { title: string; text: string; url: string }) => string;
  sortShared: (files: File[]) => { photos: File[]; documents: File[] };
};

// ── The service-worker half (client/public/share-sw.js), run with a stand-in cache ──
type Handler = (event: { request: Request; respondWith: (r: Promise<Response>) => void }) => void;
function loadShareWorker() {
  const store = new Map<string, Response>();
  const cache = {
    keys: async () => [...store.keys()],
    delete: async (k: string) => store.delete(k),
    put: async (k: string, r: Response) => void store.set(k, r),
  };
  let handler: Handler = () => {};
  const self = { location: { origin: "https://studyos.test" }, addEventListener: (_: string, h: Handler) => { handler = h; } };
  const file = fileURLToPath(new URL("../../client/public/share-sw.js", import.meta.url));
  vm.runInNewContext(readFileSync(file, "utf8"), { self, caches: { open: async () => cache }, Response, URL, URLSearchParams, Promise });
  /** Send a request through the worker; undefined means the worker left it alone. */
  const send = (request: Request) => {
    let answer: Promise<Response> | undefined;
    handler({ request, respondWith: (r) => { answer = r; } });
    return answer;
  };
  return { store, send };
}

describe("content shared into StudyOS", () => {
  it("puts the link after the text", () => {
    expect(sharedBody({ title: "T", text: "Chapter 3 summary", url: "https://example.org/a" })).toBe("Chapter 3 summary\nhttps://example.org/a");
  });
  it("does not repeat a link the text already contains", () => {
    expect(sharedBody({ title: "", text: "See https://example.org/a now", url: "https://example.org/a" })).toBe("See https://example.org/a now");
  });
  it("copes with only a link, or only text", () => {
    expect(sharedBody({ title: "", text: "", url: "https://example.org/a" })).toBe("https://example.org/a");
    expect(sharedBody({ title: "", text: "  just text  ", url: "" })).toBe("just text");
  });
});

describe("sorting shared files", () => {
  it("sends photos to the note and everything else to the Library", () => {
    const files = [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.pdf", { type: "application/pdf" }), new File(["c"], "c.png", { type: "image/png" })];
    const { photos, documents } = sortShared(files);
    expect(photos.map((f) => f.name)).toEqual(["a.jpg", "c.png"]);
    expect(documents.map((f) => f.name)).toEqual(["b.pdf"]);
  });
});

describe("the service worker receiving a share", () => {
  const post = (form: FormData) => new Request("https://studyos.test/share", { method: "POST", body: form });

  it("sets the files aside and opens the app with the text in the address", async () => {
    const { store, send } = loadShareWorker();
    const form = new FormData();
    form.set("share_title", "บทที่ 3");
    form.set("share_text", "ส่วนประสมการตลาด");
    form.set("share_url", "https://example.org/mix");
    form.append("files", new File([new Uint8Array([1, 2, 3])], "รูป หน้า 1.jpg", { type: "image/jpeg" }));
    form.append("files", new File(["%PDF"], "sheet.pdf", { type: "application/pdf" }));

    const response = await send(post(form))!;
    expect(response.status).toBe(303);
    const to = new URL(response.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://studyos.test/");
    expect(to.searchParams.get("share_title")).toBe("บทที่ 3");
    expect(to.searchParams.get("share_text")).toBe("ส่วนประสมการตลาด");
    expect(to.searchParams.get("share_url")).toBe("https://example.org/mix");
    expect(to.searchParams.get("share_files")).toBe("2");

    expect([...store.keys()]).toEqual(["/__shared/0", "/__shared/1"]);
    const first = store.get("/__shared/0")!;
    expect(first.headers.get("content-type")).toBe("image/jpeg");
    expect(decodeURIComponent(first.headers.get("x-file-name")!)).toBe("รูป หน้า 1.jpg"); // Thai file name survives
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.get("/__shared/1")!.headers.get("content-type")).toBe("application/pdf");
  });

  it("replaces what an earlier share left behind", async () => {
    const { store, send } = loadShareWorker();
    const one = new FormData();
    one.append("files", new File(["x"], "old-1.png", { type: "image/png" }));
    one.append("files", new File(["y"], "old-2.png", { type: "image/png" }));
    await send(post(one));
    const two = new FormData();
    two.append("files", new File(["z"], "new.png", { type: "image/png" }));
    await send(post(two));
    expect([...store.keys()]).toEqual(["/__shared/0"]);
    expect(decodeURIComponent(store.get("/__shared/0")!.headers.get("x-file-name")!)).toBe("new.png");
  });

  it("handles a share with text only, and one with nothing", async () => {
    const { store, send } = loadShareWorker();
    const text = new FormData();
    text.set("share_text", "just a thought");
    const a = await send(post(text))!;
    expect(new URL(a.headers.get("location")!).search).toBe("?share_text=just+a+thought");
    expect(store.size).toBe(0);
    const b = await send(post(new FormData()))!;
    expect(b.headers.get("location")).toBe("https://studyos.test/");
  });

  it("leaves every other request alone", () => {
    const { send } = loadShareWorker();
    expect(send(new Request("https://studyos.test/share"))).toBeUndefined(); // a GET
    expect(send(new Request("https://studyos.test/api/notes", { method: "POST", body: "x" }))).toBeUndefined();
  });

  it("opens the app even if the share cannot be read", async () => {
    const { send } = loadShareWorker();
    const broken = new Request("https://studyos.test/share", { method: "POST", body: "not a form", headers: { "content-type": "text/plain" } });
    const response = await send(broken)!;
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://studyos.test/");
  });
});
