import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, postJSON, type DueCard } from "../api.ts";
import { Card, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";
import Icon from "../components/Icon.tsx";

const SWIPE_THRESHOLD = 110;

export default function Review() {
  const { t } = useT();
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [totalDue, setTotalDue] = useState(0);
  const [limit, setLimit] = useState(30);
  const [idx, setIdx] = useState(0);
  const [remembered, setRemembered] = useState(0);

  useEffect(() => {
    getJSON<{ cards: DueCard[]; totalDue: number; limit: number }>("/api/flashcards/due")
      .then((d) => {
        setCards(d.cards);
        setTotalDue(d.totalDue);
        setLimit(d.limit);
      })
      .catch(() => setCards([]));
  }, []);

  if (!cards) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("review.title")}</h1>
        {cards.length > 0 && idx < cards.length && (
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {t("review.progress", { n: idx + 1, total: cards.length })}
          </span>
        )}
      </div>

      {cards.length > 0 && idx < cards.length && (
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-full h-2" style={{ backgroundColor: "var(--border-light)" }}>
            <div
              className="rounded-full h-2 transition-all"
              style={{ width: `${Math.min((idx / cards.length) * 100, 100)}%`, backgroundColor: "var(--accent)" }}
            />
          </div>
          {totalDue > cards.length && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {t("review.queueInfo", { due: totalDue, limit })}
            </span>
          )}
        </div>
      )}

      {cards.length === 0 ? (
        <Card>
          <p className="text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("review.empty")}</p>
        </Card>
      ) : idx >= cards.length ? (
        <Done reviewed={cards.length} remembered={remembered} totalDue={totalDue} />
      ) : (
        <Flashcard
          key={cards[idx].id}
          card={cards[idx]}
          onRate={(confidence) => {
            const cardId = cards[idx].id;
            if (confidence >= 3) setRemembered((n) => n + 1);
            setIdx((i) => i + 1);
            postJSON(`/api/flashcards/${cardId}/review`, { confidence }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function Flashcard({ card, onRate }: { card: DueCard; onRate: (confidence: number) => void }) {
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
    if (dragX > SWIPE_THRESHOLD) onRate(4);
    else if (dragX < -SWIPE_THRESHOLD) onRate(1);
    else setDragX(0);
  }

  const rightHint = Math.min(Math.max(dragX / 80, 0), 1);
  const leftHint = Math.min(Math.max(-dragX / 80, 0), 1);

  return (
    <div className="space-y-4">
      <div className="relative">
        <span
          className="absolute top-3 right-3 font-bold text-lg z-10"
          style={{ opacity: rightHint, color: "var(--success)" }}
        >
          {t("review.remember")} <Icon name="thumbsUp" size={18} />
        </span>
        <span
          className="absolute top-3 left-3 font-bold text-lg z-10"
          style={{ opacity: leftHint, color: "var(--danger)" }}
        >
          <Icon name="thumbsDown" size={18} /> {t("review.forgot")}
        </span>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => !revealed && setRevealed(true)}
          className="rounded-2xl px-5 py-8 min-h-[260px] flex flex-col select-none touch-none cursor-pointer"
          style={{
            backgroundColor: "var(--bg-surface)",
            boxShadow: "var(--shadow-lg)",
            transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`,
            transition: dragging ? "none" : "transform 0.25s ease",
          }}
        >
          <div className="text-xs mb-3 flex justify-between gap-2" style={{ color: "var(--text-tertiary)" }}>
            <span>
              {card.course_name ? (
                <CourseTitle
                  inline
                  code={card.course_code}
                  name_th={card.course_name}
                  name_en={card.course_name_en}
                />
              ) : null}
              {card.chapter_name ? ` · ${card.chapter_name}` : ""}
              {card.topic ? ` · ${card.topic}` : ""}
            </span>
            <span className="whitespace-nowrap">{t("review.box", { n: card.box })}</span>
          </div>

          <p className="text-lg font-medium flex-1" style={{ color: "var(--text-primary)" }}>{card.question}</p>

          {!revealed ? (
            <p className="text-center text-sm mt-4 flex items-center justify-center gap-1" style={{ color: "var(--accent-text)" }}><Icon name="tapUp" size={18} /> {t("review.tapReveal")}</p>
          ) : (
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border-light)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("review.answer")}</span>
              <p className="mt-1" style={{ color: "var(--text-primary)" }}>{card.model_answer}</p>
            </div>
          )}
        </div>
      </div>

      {revealed && (
        <>
          <p className="text-center text-xs" style={{ color: "var(--text-tertiary)" }}>{t("review.confidenceHint")}</p>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => onRate(1)}
              className="font-medium rounded-xl py-3 text-sm"
              style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}
            >
              {t("review.conf1")}
            </button>
            <button
              onClick={() => onRate(2)}
              className="font-medium rounded-xl py-3 text-sm"
              style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning)" }}
            >
              {t("review.conf2")}
            </button>
            <button
              onClick={() => onRate(3)}
              className="font-medium rounded-xl py-3 text-sm"
              style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning)" }}
            >
              {t("review.conf3")}
            </button>
            <button
              onClick={() => onRate(4)}
              className="font-medium rounded-xl py-3 text-sm"
              style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}
            >
              {t("review.conf4")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Done({ reviewed, remembered, totalDue }: { reviewed: number; remembered: number; totalDue: number }) {
  const { t } = useT();
  const remaining = totalDue - reviewed;
  return (
    <Card>
      <div className="text-center space-y-2 py-6">
        <div style={{ color: "var(--accent-text)" }}><Icon name="sparkles" size={40} /></div>
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{t("review.doneTitle")}</h2>
        <p style={{ color: "var(--text-secondary)" }}>{t("review.reviewed", { n: reviewed })}</p>
        <p className="font-semibold" style={{ color: "var(--success)" }}>{t("review.remembered", { n: remembered })}</p>
        {remaining > 0 && (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {t("review.remaining", { n: remaining })}
          </p>
        )}
      </div>
    </Card>
  );
}
