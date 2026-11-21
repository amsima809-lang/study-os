import { afterEach, expect, it, vi } from "vitest";

const { clearLectureLink, readLectureLink, rememberLectureLink } =
  await import(new URL("../../client/src/lectureLink.ts", import.meta.url).href) as {
    clearLectureLink(): void;
    readLectureLink(): string | null;
    rememberLectureLink(): void;
  };

afterEach(() => vi.unstubAllGlobals());

it("retains the requested summary across sign-in and consumes it after opening", () => {
  const session = new Map<string,string>();
  vi.stubGlobal("sessionStorage", {
    setItem: (key: string, value: string) => session.set(key, value),
    getItem: (key: string) => session.get(key) ?? null,
    removeItem: (key: string) => session.delete(key),
  });
  const browser = { location: new URL("https://example.test/?view=lectures&summary=MGT3204-1") };
  vi.stubGlobal("window", browser);
  rememberLectureLink();
  browser.location = new URL("https://example.test/");
  expect(readLectureLink()).toBe("MGT3204-1");
  clearLectureLink();
  expect(readLectureLink()).toBeNull();
});

it("opens the old library link and cleans a fresh-launch address under a subpath", () => {
  const replaceState = vi.fn();
  const browser = { location: new URL("https://example.test/app/api/open/lectures?view=lectures&summary=RAM1132-2&other=keep"), history: { replaceState } };
  vi.stubGlobal("window", browser);
  expect(readLectureLink()).toBe("RAM1132-2");
  clearLectureLink();
  expect(String(replaceState.mock.calls[0][2])).toBe("https://example.test/app/?other=keep");
  browser.location = new URL("https://example.test/app/?view=lectures");
  expect(readLectureLink()).toBe("1");
});

it("opens a timestamped practice source and cleans only the lecture parameters", () => {
  const replaceState = vi.fn();
  const browser = { location: new URL("https://example.test/app/?view=lectures&transcript=MGT3204-7&at=0&other=keep"), history: { replaceState } };
  vi.stubGlobal("window", browser);
  expect(readLectureLink()).toBe("MGT3204-7@0");
  clearLectureLink();
  expect(String(replaceState.mock.calls[0][2])).toBe("https://example.test/app/?other=keep");
  browser.location = new URL("https://example.test/app/?view=lectures&transcript=MGT3204-7&at=-1");
  expect(readLectureLink()).toBe("1");
});
