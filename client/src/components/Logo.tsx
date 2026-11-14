/**
 * The logo mark: an open book whose right page lifts into a tick — study that
 * ends in "got it". Source and the other concepts: docs/brand/.
 *
 * It is drawn in the current text colour, so it takes any theme. The lifted
 * page can have its own colour: pass `tick` (the app shell gives it the
 * theme's second colour).
 */
import type { CSSProperties } from "react";

export default function Logo({
  size = 24,
  tick,
  className = "",
  style,
}: {
  size?: number;
  /** Colour of the lifted page. Defaults to the same colour as the rest. */
  tick?: string;
  className?: string;
  style?: CSSProperties;
}) {
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
      {/* Left page: the short stroke of the tick */}
      <path
        opacity={tick ? 0.75 : 0.5}
        d="M8 21.5c0-1.9 1.6-3.3 3.5-3 6.3 1 11.8 3.4 16.5 7.3V53c-4.7-3.700-10.300-6-16.700-6.900C9.400 45.900 8 44.300 8 42.400z"
      />
      {/* Right page, lifted: the long stroke of the tick */}
      <path fill={tick ?? "currentColor"} d="M28 25.8 49.2 8.300c2.900-2.400 7.200 0.800 5.600 4.200L36.600 51.800c-1.500 3.200-5.600 4-8.600 1.200z" />
    </svg>
  );
}
