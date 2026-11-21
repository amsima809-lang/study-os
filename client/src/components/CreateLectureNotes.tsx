import { useEffect, useRef, useState } from "react";
import { getJSON, postJSON } from "../api.ts";
import { useT } from "../i18n.tsx";
import type { CreatedLectureNotes, LectureSources } from "../combinedLectureNotes.ts";

type CombinedState = { status: "ready" | "pending" | "failed"; created: CreatedLectureNotes | null };

export function CreateLectureNotes({ path, sources, onCreated }: {
  path: string;
  sources: LectureSources;
  onCreated: (created: CreatedLectureNotes | null) => void;
}) {
  const { lang } = useT();
  const th = lang === "th";
  const [status, setStatus] = useState<CombinedState["status"]>("ready");
  const [retry, setRetry] = useState(0);
  const tried = useRef(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function check(again = false) {
      try {
        const result = again ? await postJSON<CombinedState>(path + "/retry", {}) : await getJSON<CombinedState>(path);
        if (!active) return;
        setStatus(result.status);
        onCreated(result.created);
        if (result.status === "pending") timer = setTimeout(() => void check(), 1600);
      } catch {
        if (active) { setStatus("failed"); onCreated(null); }
      }
    }
    void check(retry !== tried.current);
    tried.current = retry;
    return () => { active = false; clearTimeout(timer); };
  }, [path, sources, retry, onCreated]);

  if (status === "ready") return null;
  if (status === "pending") return <p role="status" className="text-sm">
    {th ? "กำลังหาข้อความในสรุปที่เกี่ยวข้อง…" : "Finding related summary passages…"}
  </p>;
  return <p role="alert" className="text-sm">
    {th ? "บันทึกโน้ตแล้ว แต่ค้นหาข้อความที่เกี่ยวข้องไม่สำเร็จ" : "Your notes are saved. Couldn’t find related summary passages."}{" "}
    <button type="button" className="underline min-h-11" onClick={() => setRetry(n => n + 1)}>
      {th ? "ลองอีกครั้ง" : "Try again"}
    </button>
  </p>;
}
