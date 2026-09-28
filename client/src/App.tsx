import { useEffect, useState } from "react";

type Health = {
  ok: boolean;
  app: string;
  phase: number;
  tz: string;
  time: string;
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-indigo-600">StudyOS</h1>
      <p className="text-slate-600 text-center">
        ระบบช่วยเรียน ม.รามคำแหง — เฟส 0 พร้อมแล้ว ✅
      </p>

      <div className="rounded-xl bg-white shadow px-4 py-3 text-sm w-full max-w-xs">
        {error && <span className="text-red-600">{error}</span>}
        {!error && !health && <span className="text-slate-400">กำลังเชื่อมต่อ…</span>}
        {health && (
          <ul className="space-y-1">
            <li>สถานะเซิร์ฟเวอร์: <span className="text-green-600 font-medium">เชื่อมต่อแล้ว</span></li>
            <li>โซนเวลา: {health.tz}</li>
            <li>เฟส: {health.phase}</li>
          </ul>
        )}
      </div>
    </div>
  );
}
