/*
 * StudyOS lecture-transcript collector for Ramkhamhaeng's "VOD Subtitle" site
 * (sub-demo.ru.ac.th/student/).
 *
 * It runs INSIDE the university's page, in the student's own signed-in
 * browser, and reads what that student can already see: the list of lectures
 * for one course and the subtitles embedded in each lecture page. StudyOS never
 * signs in to the university and never sees the student's password.
 *
 * Two ways to run it:
 *   1. Bookmark (desktop browsers today): loading this file on a course or
 *      lecture page collects that course and downloads one .json file, which
 *      the student imports in StudyOS > Library > Recorded lectures.
 *   2. In-app browser (native app, later): the app injects this file with
 *      `window.STUDYOS_COLLECTOR_EMBED = true`, calls
 *      `StudyOSCollector.collectCourse(...)` and receives the bundle itself.
 *
 * Plain JavaScript on purpose: it is injected into someone else's page, so it
 * has no build step and no dependencies.
 */
(function (global) {
  "use strict";

  var DELAY_MS = 800; // pause between pages: be gentle with the university's server

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /** "ACC1101_ACC1103_S1" -> ["ACC1101", "ACC1103"] (section suffixes dropped). */
  function courseCodes(label) {
    return String(label || "").split(/[^A-Za-z0-9]+/).filter(function (part) {
      return /^[A-Z]{3}\d{4}$/.test(part);
    });
  }

  /**
   * Pull the `var CUES = [...]` array out of a lecture page's HTML.
   * Walks the text instead of using a regex so brackets inside subtitle text
   * cannot end the array early. Returns null when the page has no CUES.
   */
  function extractCues(html) {
    var marker = html.search(/\bCUES\s*=\s*\[/);
    if (marker < 0) return null;
    var start = html.indexOf("[", marker);
    var depth = 0, inString = false, escaped = false;
    for (var i = start; i < html.length; i++) {
      var ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "[") depth++;
      else if (ch === "]" && --depth === 0) {
        var parsed;
        try { parsed = JSON.parse(html.slice(start, i + 1)); } catch (e) { return null; }
        if (!Array.isArray(parsed)) return null;
        return parsed
          .filter(function (c) {
            return c && typeof c.text === "string" && isFinite(c.startMs) && isFinite(c.endMs);
          })
          .map(function (c) {
            return { startMs: Math.round(c.startMs), endMs: Math.round(c.endMs), text: c.text.slice(0, 2000) };
          });
      }
    }
    return null;
  }

  /** Lecture links on a course page: [{ no, url }], in lecture order. */
  function extractSessions(html, baseUrl) {
    var sessions = [], seen = {};
    var re = /<a[^>]+href="(watch\.php\?session_id=\d+)"[^>]*>([\s\S]*?)<\/a>/g, m;
    while ((m = re.exec(html))) {
      var no = (m[2].replace(/<[^>]+>/g, " ").match(/\d+/) || [])[0];
      if (!no || seen[no]) continue;
      seen[no] = true;
      sessions.push({ no: Number(no), url: new URL(m[1], baseUrl).href });
    }
    return sessions.sort(function (a, b) { return a.no - b.no; });
  }

  function extractLabel(html) {
    var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? m[1].replace(/\s+/g, " ").split(/\s[—-]\s/)[0].trim() : "";
  }

  function getPage(url, fetchImpl) {
    return fetchImpl(url, { credentials: "same-origin" }).then(function (res) {
      // The site answers a signed-out request by redirecting to its login page.
      if (/login\.php/.test(res.url || "")) throw new Error("NOT_SIGNED_IN");
      if (!res.ok) throw new Error("HTTP_" + res.status);
      return res.text();
    });
  }

  /**
   * Collect every lecture of one course.
   * options: { fetch, delayMs, onProgress(done, total) }
   * Resolves to a bundle StudyOS can import; lectures without subtitles are
   * listed in `skipped` rather than invented.
   */
  function collectCourse(subjectUrl, options) {
    options = options || {};
    var fetchImpl = options.fetch || global.fetch.bind(global);
    var delay = options.delayMs == null ? DELAY_MS : options.delayMs;
    var progress = options.onProgress || function () {};

    return getPage(subjectUrl, fetchImpl).then(async function (html) {
      var label = extractLabel(html);
      var codes = courseCodes(label);
      var sessions = extractSessions(html, subjectUrl);
      if (codes.length === 0 || sessions.length === 0) throw new Error("NOT_A_COURSE_PAGE");

      var done = [], skipped = [];
      for (var i = 0; i < sessions.length; i++) {
        progress(i, sessions.length);
        if (i > 0) await sleep(delay);
        var cues = extractCues(await getPage(sessions[i].url, fetchImpl));
        if (cues && cues.length) done.push({ no: sessions[i].no, url: sessions[i].url, cues: cues });
        else skipped.push(sessions[i].no);
      }
      progress(sessions.length, sessions.length);
      if (done.length === 0) throw new Error("NO_SUBTITLES_FOUND");

      return {
        format: "studyos-lecture-transcripts",
        version: 1,
        source: "ru-vod-subtitle",
        subject_label: label,
        course_codes: codes,
        collected_at: new Date().toISOString(),
        sessions: done,
        skipped: skipped,
      };
    });
  }

  /** The course page for wherever the student is now, or null. */
  function currentSubjectUrl(doc, loc) {
    if (/subject\.php/.test(loc.pathname)) return loc.href;
    var back = doc.querySelector('a[href^="subject.php"]');
    return back ? new URL(back.getAttribute("href"), loc.href).href : null;
  }

  // ── Bookmark mode: a small panel on the page, then a file download ──────────
  // The product's name as the student sees it (these messages are in Thai). This file
  // runs on the university's site and cannot import client/src/brand.ts, so the name
  // is repeated here; scripts/rename-app.mjs changes it together with the others.
  var APP_NAME_TH = "Upleaf"; // @app-name-th
  var TEXT = {
    working: APP_NAME_TH + ": กำลังเก็บคำบรรยาย",
    done: APP_NAME_TH + ": บันทึกไฟล์แล้ว นำเข้าได้ที่ คลังเอกสาร ใน " + APP_NAME_TH,
    NOT_SIGNED_IN: APP_NAME_TH + ": กรุณาเข้าสู่ระบบก่อน แล้วลองอีกครั้ง",
    NOT_A_COURSE_PAGE: APP_NAME_TH + ": เปิดหน้ารายวิชาหรือหน้าวิดีโอก่อน แล้วลองอีกครั้ง",
    NO_SUBTITLES_FOUND: APP_NAME_TH + ": ไม่พบคำบรรยายในรายวิชานี้",
    other: APP_NAME_TH + ": เก็บคำบรรยายไม่สำเร็จ",
  };

  function runFromBookmark() {
    var doc = global.document;
    var panel = doc.getElementById("studyos-collector") || doc.createElement("div");
    panel.id = "studyos-collector";
    panel.setAttribute("role", "status");
    panel.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;max-width:420px;margin:0 auto;" +
      "padding:14px 16px;border-radius:14px;background:#1a1929;color:#fff;font:15px/1.5 system-ui,sans-serif;" +
      "box-shadow:0 8px 32px rgba(0,0,0,.35)";
    doc.body.appendChild(panel);
    var say = function (text) { panel.textContent = text; };

    var subject = currentSubjectUrl(doc, global.location);
    if (!subject) return say(TEXT.NOT_A_COURSE_PAGE);

    say(TEXT.working);
    collectCourse(subject, {
      onProgress: function (n, total) { say(TEXT.working + " " + n + "/" + total); },
    }).then(function (bundle) {
      var blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
      var link = doc.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "studyos-lectures-" + bundle.course_codes.join("_") + ".json";
      doc.body.appendChild(link);
      link.click();
      link.remove();
      say(TEXT.done + " (" + bundle.sessions.length + ")");
    }).catch(function (err) {
      say(TEXT[err && err.message] || TEXT.other);
    });
  }

  global.StudyOSCollector = {
    collectCourse: collectCourse,
    currentSubjectUrl: currentSubjectUrl,
    // exposed for tests
    extractCues: extractCues,
    extractSessions: extractSessions,
    courseCodes: courseCodes,
  };

  if (global.document && !global.STUDYOS_COLLECTOR_EMBED) runFromBookmark();
})(typeof window !== "undefined" ? window : globalThis);
