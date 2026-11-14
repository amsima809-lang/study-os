/**
 * The logo mark: a cairn — the stack of stones that marks a trail and the top of
 * a climb — built from three books, rising to a small top book. Source, the
 * drawing script and the other concepts: docs/brand/.
 *
 * It is drawn in the current text colour, so it takes any theme. The top book
 * can have its own colour: pass `accent` (the app shell gives it the theme's
 * second colour). Under 24 pixels the page lines are dropped and the books are
 * drawn solid, so the mark stays clear.
 */
import type { CSSProperties } from "react";
import { LOGO_BOOKS, LOGO_BOOKS_SMALL, LOGO_PAGES_OPACITY } from "./logoPaths.ts";

export default function Logo({
  size = 24,
  accent,
  className = "",
  style,
}: {
  size?: number;
  /** Colour of the top book. Defaults to the same colour as the rest. */
  accent?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const books = size < 24 ? LOGO_BOOKS_SMALL : LOGO_BOOKS;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      style={style}
    >
      {books.map((book, i) => (
        <g key={i} transform={book.rotate}>
          <path fill={book.accent ? (accent ?? "currentColor") : undefined} d={book.cover} />
          {book.pages && <path opacity={LOGO_PAGES_OPACITY} d={book.pages} />}
        </g>
      ))}
    </svg>
  );
}
