interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const paths: Record<string, string> = {
  // ── nav ──
  calendar:
    "M8 2v3m8-3v3M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  notebook:
    "M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm1 5h10M7 11h10M7 15h6",
  target:
    "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-6a4 4 0 100-8 4 4 0 000 8zm0-2a2 2 0 100-4 2 2 0 000 4z",
  refresh:
    "M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15",
  moreHorizontal: "M12 13a1 1 0 100-2 1 1 0 000 2zm7 0a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z",
  book: "M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5zm0 0V5",

  // ── more menu ──
  calendarCheck:
    "M8 2v3m8-3v3M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zm5 10l2 2 4-4",
  library: "M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5zm0 0V5m5-1v18m4-18v18",
  calendarRange:
    "M8 2v3m8-3v3M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zm4 9h2m4 0h2M9 17h2",
  chartBar: "M18 20V10m-6 10V4M6 20v-6",
  graduationCap:
    "M2 10l10-5 10 5-10 5-10-5zm5 3.5v4l5 2.5 5-2.5v-4",
  fileEdit:
    "M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2zM14 2v6h6m-9.5 5L8 18l2.5-.5 7-7-2-2-7 7z",
  crosshair:
    "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v4m0 4v2m4-6h2m-12 0h2",

  // ── theme ──
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zm0-15v2m0 16v2m-9-9h2m16 0h2M5.636 5.636l1.414 1.414m9.9 9.9l1.414 1.414M5.636 18.364l1.414-1.414m9.9-9.9l1.414-1.414",
  moon: "M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z",
  monitor:
    "M4 5h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2zm5 17h6m-3-4v4",

  // ── status ──
  check: "M20 6L9 17l-5-5",
  checkCircle: "M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3",
  square: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z",
  alertTriangle:
    "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01",
  lightbulb:
    "M9 18h6m-5 2h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  sparkles:
    "M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zm6 10l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM5 16l.75 2.25L8 19l-2.25.75L5 22l-.75-2.25L2 19l2.25-.75L5 16z",
  trophy:
    "M6 9H3a1 1 0 01-1-1V6a1 1 0 011-1h3m12 4h3a1 1 0 001-1V6a1 1 0 00-1-1h-3M6 5v7a6 6 0 1012 0V5M6 5h12M9 21h6m-3-3v3",

  // ── actions ──
  thumbsUp:
    "M14 9V5a3 3 0 00-6 0v4H5a2 2 0 00-2 2v1.1a2 2 0 00.1.6l2.6 7.8a1 1 0 001 .7h6.6A2 2 0 0015.5 20l.8-4a2 2 0 00-2-2.4H14zm7-1v8",
  thumbsDown:
    "M10 15v4a3 3 0 006 0v-4h3a2 2 0 002-2v-1.1a2 2 0 00-.1-.6L18.3 3.5a1 1 0 00-1-.7h-6.6A2 2 0 008.5 4l-.8 4a2 2 0 002 2.4H10zM3 16V8",
  tapUp: "M12 18V6m-4 4l4-4 4 4",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7",
  flagOff: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 7v-7",

  // ── file types ──
  fileText:
    "M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2zM14 2v6h6M8 13h8M8 17h8M8 9h2",
  image:
    "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm10 4a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM21 15l-5-5L5 21",
  edit: "M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z",

  // ── study types ──
  bookOpen:
    "M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2V3zm20 0h-6a4 4 0 00-4 4v14a3 3 0 013-3h7V3z",
  penTool:
    "M12 19l7-7 3 3-7 7H12v-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z",
  rotateCcw:
    "M1 4v6h6m-.87 2A9 9 0 1021 12",
  clipboard:
    "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2m1-2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V2a1 1 0 011-1z",

  // ── drawing tools ──
  pen: "M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z",
  highlighter:
    "M15.5 4.5l4 4-10.5 10.5H5v-4L15.5 4.5zm-3.5.5L3 14v3h3L15 8m2 14H7",
  eraser:
    "M20 20H8.5l-4.21-4.3a1 1 0 010-1.4L15.29 3.3a1 1 0 011.42 0l4 4a1 1 0 010 1.4L13 16.5",
  trash:
    "M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2m-6 5v6m4-6v6",
  filePlus:
    "M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2zM14 2v6h6M12 11v6m-3-3h6",
  fileMinus:
    "M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2zM14 2v6h6M9 14h6",

  // ── camera/media ──
  camera:
    "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z",
  imagePlus:
    "M5 3h14a2 2 0 012 2v10m-6-8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 21H3V5m2 16h14a2 2 0 002-2v-2m-7-2l-5 5M16 19v4m-2-2h4",
  save: "M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8",
  robot:
    "M12 2a2 2 0 012 2v1h3a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h3V4a2 2 0 012-2zm-3 9a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2zm-6 4h6",

  // ── input modes ──
  keyboard:
    "M2 6h20a2 2 0 012 2v8a2 2 0 01-2 2H2a2 2 0 01-2-2V8a2 2 0 012-2zm4 3h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6",
  handwrite:
    "M15 3l4 4L7 19l-5 2 2-5L15 3zm-4 18h8",

  // ── finance ──
  wallet:
    "M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-1m0-4h-6a2 2 0 100 4h6m0-4a2 2 0 110 4",
  coins:
    "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-1-14h2.5a1.5 1.5 0 010 3H11a1.5 1.5 0 000 3h2.5M12 7v1m0 8v1",

  // ── misc ──
  zap: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  shield:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  arrowLeft: "M19 12H5m7-7l-7 7 7 7",
  plus: "M12 5v14m-7-7h14",
  x: "M18 6L6 18M6 6l12 12",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  mapPin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zm-9 3a3 3 0 100-6 3 3 0 000 6z",
  clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v6l4 2",
  info: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14h.01M12 11v6",
};

export default function Icon({ name, size = 20, className = "", style }: IconProps) {
  const d = paths[name];
  if (!d) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
