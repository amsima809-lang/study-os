/**
 * Small, drawn illustrations of the lecture-note features for the front page (Landing.tsx), in the
 * same phone outline as the screenshots. They show what the screens do (an AI summary with time
 * chips, a pen note read into text under the marked line, her own notes merged in her colours with a
 * redrawn diagram and an equation) with made-up sample content, in the page's language. When real
 * screenshots of these screens exist (scripts/landing-shots.mjs), they can replace these.
 * Nothing here is smaller than 12px.
 */
import { useT } from "../i18n.tsx";

export type NotesDemo = "lecture" | "annotate" | "combine";

const C = {
  screen: "#16152b", card: "#211f38", text: "#ece9f7", text2: "#c2bdd6", text3: "#8f89a8",
  accent: "#8b7cf0", accentBg: "rgba(139,124,240,0.18)", amber: "#fbbf24", amberBg: "rgba(251,191,36,0.16)",
  warnBg: "#3a2f16", warn: "#f5c26b", inkBlue: "#4aa3ff", inkRed: "#ff6b6b",
};

const TEXT = {
  th: {
    head: "ACC1103 · ครั้งที่ 2", banner: "AI อาจผิดได้ — ยึดตำรารามฯ เป็นหลัก", main: "ประเด็นหลัก",
    p1: "บัญชีแบ่งเป็น 5 หมวด", p2: "สินทรัพย์แบ่งเป็นหมุนเวียนและไม่หมุนเวียนที่ 1 ปี", p3: "สมการบัญชี",
    transcript: "คำบรรยาย", line: "…แบ่งที่ระยะเวลา 1 ปีนะคะ ถ้าเกิน 1 ปีเป็นไม่หมุนเวียน…", back: "↑ ประเด็นที่ 2",
    marked: "ที่ดินไม่ต้องคิดค่าเสื่อมราคา", ink: "ออกสอบ!", read: "ออกสอบ! (จากลายมือ)",
    mine: "โน้ตของฉัน", blue: "ลูกหนี้การค้า = หมุนเวียน", red: "จำ: เกิน 1 ปี = ไม่หมุนเวียน",
    assets: "สินทรัพย์", current: "หมุนเวียน", noncurrent: "ไม่หมุนเวียน", eq: "สินทรัพย์ = หนี้สิน + ส่วนของเจ้าของ",
    tabs: ["วันนี้", "ชั้นเรียน", "เนื้อหา", "ฝึกทำ", "ปริญญา"],
  },
  en: {
    head: "ACC1103 · Lecture 2", banner: "AI can be wrong — the RU textbook comes first", main: "Main points",
    p1: "Accounts fall into 5 categories", p2: "Assets split into current and non-current at 1 year", p3: "The accounting equation",
    transcript: "Transcript", line: "…the line is one year: longer than a year is non-current…", back: "↑ Point 2",
    marked: "land is not depreciated", ink: "on the exam!", read: "on the exam! (from your handwriting)",
    mine: "My notes", blue: "Accounts receivable = current", red: "Remember: over 1 year = non-current",
    assets: "Assets", current: "Current", noncurrent: "Non-current", eq: "Assets = Liabilities + Owner’s equity",
    tabs: ["Today", "Classes", "Study", "Practice", "Degree"],
  },
};

const chip = (s: string) => (
  <span className="rounded-full px-1.5 tabular-nums" style={{ backgroundColor: C.accentBg, color: C.accent, fontSize: 12 }}>{s}</span>
);

export function PhoneDemo({ kind, label, className = "" }: { kind: NotesDemo; label: string; className?: string }) {
  const { lang } = useT();
  const x = TEXT[lang === "th" ? "th" : "en"];
  return (
    <div role="img" aria-label={label} className={`rounded-[2.4rem] p-2 ${className}`}
      style={{ background: "linear-gradient(160deg, #3a3760 0%, #17162b 100%)", boxShadow: "0 30px 60px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
      {/* Same proportions as the screenshots (390 × 844): the app's top bar, the screen, and its tab bar. */}
      <div aria-hidden className="rounded-[1.9rem] overflow-hidden text-left flex flex-col"
        style={{ backgroundColor: C.screen, color: C.text, fontSize: 12, lineHeight: 1.55, aspectRatio: "390 / 844" }}>
        <div className="flex items-center gap-1.5 px-4 pt-4 pb-2" style={{ borderBottom: "1px solid #24223d" }}>
          <span style={{ color: C.amber }}>≡</span><span className="font-semibold" style={{ color: C.accent }}>Termtrail</span>
          <span className="ml-auto rounded-full" style={{ width: 16, height: 16, backgroundColor: C.accent }}/>
        </div>
        <div className="px-4 pt-3 pb-2 font-semibold" style={{ fontSize: 14 }}>{x.head}</div>
        <div className="px-3 pb-3 space-y-2 flex-1 min-h-0 overflow-hidden">
          <div className="rounded-lg px-2 py-1" style={{ backgroundColor: C.warnBg, color: C.warn }}>⚠ {x.banner}</div>

          {kind === "lecture" && <>
            <div className="rounded-xl p-2.5 space-y-1.5" style={{ backgroundColor: C.card }}>
              <div className="font-semibold">{x.main}</div>
              <div style={{ color: C.text2 }}>• {x.p1} {chip("35:09")}</div>
              <div className="rounded-md px-1 -mx-1" style={{ color: C.text2, outline: `2px solid ${C.accent}` }}>• {x.p2} {chip("42:58")}</div>
              <div style={{ color: C.text2 }}>• {x.p3} {chip("1:13:10")}</div>
            </div>
            <div className="text-center" style={{ color: C.accent }}>↓</div>
            <div className="rounded-xl p-2.5 space-y-1" style={{ backgroundColor: C.card }}>
              <div className="font-semibold">{x.transcript}</div>
              <div style={{ color: C.text3 }}>{chip("42:41")} …</div>
              <div className="rounded-md px-1 -mx-1" style={{ backgroundColor: "rgba(251,191,36,0.22)", color: C.text }}>{chip("42:58")} {x.line}</div>
              <div><span className="rounded-full px-2" style={{ backgroundColor: C.accentBg, color: C.accent, fontSize: 12 }}>{x.back}</span></div>
            </div>
          </>}

          {kind === "annotate" && <div className="rounded-xl p-2.5 space-y-2" style={{ backgroundColor: C.card }}>
            <div className="font-semibold">{x.main}</div>
            <div style={{ color: C.text2 }}>• {x.p2} {chip("42:58")}</div>
            <div style={{ color: C.text2 }}>
              • <span style={{ textDecoration: `underline ${C.inkRed} 2px`, textUnderlineOffset: 3 }}>{x.marked}</span> {chip("57:59")}
            </div>
            {/* her ink beside the marked words */}
            <svg viewBox="0 0 200 40" className="w-full" style={{ height: 38 }}>
              <path d="M8 26c10-14 18-14 22 0s14 6 20-8 12-8 16 4 10 10 18-2 14-8 20 2" fill="none" stroke={C.inkRed} strokeWidth="2.4" strokeLinecap="round"/>
              <path d="M112 12v18M112 34v1" stroke={C.inkRed} strokeWidth="2.6" strokeLinecap="round"/>
            </svg>
            <div className="rounded-lg px-2 py-1 ml-3" style={{ backgroundColor: C.amberBg, color: C.amber }}>✎ {x.read}</div>
            <div style={{ color: C.text2 }}>• {x.p3} {chip("1:13:10")}</div>
          </div>}

          {kind === "combine" && <div className="rounded-xl p-2.5 space-y-2" style={{ backgroundColor: C.card }}>
            <div style={{ color: C.text2 }}>• {x.p2} {chip("42:58")}</div>
            <div className="pl-2" style={{ borderLeft: `3px solid ${C.inkBlue}`, color: C.inkBlue }}>{x.blue}</div>
            <div className="pl-2" style={{ borderLeft: `3px solid ${C.inkRed}`, color: C.inkRed }}>{x.red}</div>
            {/* a sketch, redrawn as a clean diagram */}
            <svg viewBox="0 0 220 86" className="w-full" style={{ height: 80 }} fontSize="12" fill={C.text}>
              <rect x="70" y="2" width="80" height="22" rx="6" fill="#2d2a4d" stroke={C.accent}/>
              <text x="110" y="17" textAnchor="middle">{x.assets}</text>
              <path d="M95 24l-40 30M125 24l40 30" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#lnd-ah)"/>
              <defs><marker id="lnd-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill={C.accent}/></marker></defs>
              <rect x="6" y="58" width="96" height="22" rx="6" fill="#2d2a4d" stroke={C.accent}/>
              <text x="54" y="73" textAnchor="middle">{x.current}</text>
              <rect x="118" y="58" width="96" height="22" rx="6" fill="#2d2a4d" stroke={C.accent}/>
              <text x="166" y="73" textAnchor="middle">{x.noncurrent}</text>
            </svg>
            <div className="rounded-lg px-2 py-1.5 text-center" style={{ backgroundColor: "#1a1830", borderLeft: `3px solid ${C.accent}`, fontFamily: "Georgia, 'Times New Roman', serif" }}>{x.eq}</div>
            <div style={{ color: C.text3 }}>{x.mine} · {x.head}</div>
          </div>}
        </div>
        <div className="grid grid-cols-5 px-2 pt-2 pb-3 text-center" style={{ borderTop: "1px solid #24223d", color: C.text3 }}>
          {[x.tabs[0], x.tabs[1], x.tabs[2], x.tabs[3], x.tabs[4]].map((tab, i) =>
            <span key={i} style={i === 2 ? { color: C.accent, fontWeight: 600 } : undefined}>{tab}</span>)}
        </div>
      </div>
    </div>
  );
}
