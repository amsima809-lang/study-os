import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, postJSON, type DueCard } from "../api.ts";
import { Card, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";

const SWIPE_THRESHOLD = 110;

export default function Review() {
  const { t } = useT();
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [remembered, setRemembered] = useState(0);

  useEffect(() => {
    getJSON<{ cards: DueCard[] }>("/api/flashcards/due")
      .then((d) => setCards(d.cards))
      .catch(() => setCards([]));
  }, []);

  if (!cards) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">{t("review.title")}</h1>
        {cards.length > 0 && idx < cards.length && (
          <span className="text-sm text-slate-400">
            {t("review.progress", { n: idx + 1, total: cards.length })}
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        <Card>
          <p className="text-center text-slate-500 py-8">{t("review.empty")}</p>
        </Card>
      ) : idx >= cards.length ? (
        <Done reviewed={cards.length} remembered={remembered} />
      ) : (
        <Flashcard
          key={cards[idx].id}
          card={cards[idx]}
          onRate={async (correct) => {
            if (correct) setRemembered((n) => n + 1);
            try {
              await postJSON(`/api/flashcards/${cards[idx].id}/review`, { correct });
            } catch {
              // even if the network hiccups, keep the review flowing
            }
            setIdx((i) => i + 1);
          }}
        />
      )}
    </div>
  );
}

function Flashcard({ card, onRate }: { card: DueCard; onRate: (correct: boolean) => void }) {
  const { t } = useT();
  const [revealed, setRevealed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    if (!revealed) return;
    setDragging(true);
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setDragX(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX > SWIPE_THRESHOLD) onRate(true);
    else if (dragX < -SWIPE_THRESHOLD) onRate(false);
    else setDragX(0);
  }

  const rightHint = Math.min(Math.max(dragX / 80, 0), 1);
  const leftHint = Math.min(Math.max(-dragX / 80, 0), 1);

  return (
    <div className="space-y-4">
      <div className="relative">
        {/* swipe hint labels */}
        <span
          className="absolute top-3 right-3 text-green-600 font-bold text-lg z-10"
          style={{ opacity: rightHint }}
        >
          {t("review.remember")} 👍
        </span>
        <span
          className="absolute top-3 left-3 text-red-500 font-bold text-lg z-10"
          style={{ opacity: leftHint }}
        >
          👎 {t("review.forgot")}
        </span>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => !revealed && setRevealed(true)}
          className="rounded-2xl bg-white shadow-lg px-5 py-8 min-h-[260px] flex flex-col select-none touch-none cursor-pointer"
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`,
            transition: dragging ? "none" : "transform 0.25s ease",
          }}
        >
          <div className="text-xs text-slate-400 mb-3 flex justify-between gap-2">
            <span>
              {card.course_name ? (
                <CourseTitle
                  inline
                  code={card.course_code}
                  name_th={card.course_name}
                  name_en={card.course_name_en}
                />
              ) : null}
              {card.topic ? ` · ${card.topic}` : ""}
            </span>
            <span className="whitespace-nowrap">{t("review.box", { n: card.box })}</span>
          </div>

          <p className="text-lg font-medium text-slate-800 flex-1">{card.question}</p>

          {!revealed ? (
            <p className="text-center text-indigo-400 text-sm mt-4">👆 {t("review.tapReveal")}</p>
          ) : (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-400">{t("review.answer")}</span>
              <p className="text-slate-700 mt-1">{card.model_answer}</p>
            </div>
          )}
        </div>
      </div>

      {revealed && (
        <>
          <p className="text-center text-xs text-slate-400">{t("review.swipeHint")}</p>
          <div className="flex gap-3">
            <button
              onClick={() => onRate(false)}
              className="flex-1 bg-red-50 text-red-600 font-medium rounded-xl py-3"
            >
              👎 {t("review.forgot")}
            </button>
            <button
              onClick={() => onRate(true)}
              className="flex-1 bg-green-50 text-green-600 font-medium rounded-xl py-3"
            >
              {t("review.remember")} 👍
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Done({ reviewed, remembered }: { reviewed: number; remembered: number }) {
  const { t } = useT();
  return (
    <Card>
      <div className="text-center space-y-2 py-6">
        <div className="text-4xl">🎉</div>
        <h2 className="text-xl font-bold text-slate-800">{t("review.doneTitle")}</h2>
        <p className="text-slate-600">{t("review.reviewed", { n: reviewed })}</p>
        <p className="text-green-600 font-semibold">{t("review.remembered", { n: remembered })}</p>
      </div>
    </Card>
  );
}
