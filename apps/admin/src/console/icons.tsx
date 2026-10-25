/* The product's icon set (same paths as apps/web/src/figma/rap_kit.tsx) so the
   staff console looks and feels like the main application. */
const P: Record<string, string> = {
  home: "M3 11l9-8 9 8|M5 10v10h5v-6h4v6h5V10",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2|M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M21 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  briefcase: "M3 8h18v12H3z|M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|M3 14h18",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14|M21 21l-4.3-4.3",
  check: "M20 6L9 17l-5-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18|M12 7v5l3 2",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  chart: "M4 20V10|M10 20V4|M16 20v-7|M22 20H2",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18|M3 12h18|M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  flag: "M4 22V4|M4 4h13l-2 4 2 4H4",
  lock: "M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4",
  file: "M6 2h9l5 5v15H6z|M14 2v6h6",
  layers: "M12 2l10 5-10 5L2 7z|M2 12l10 5 10-5|M2 17l10 5 10-5",
  list: "M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01",
  building: "M4 21V4h11v17|M15 9h5v12|M8 8h3|M8 12h3|M8 16h3",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2|M5 5h14l3 7v7H2v-7z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8|M10.3 20a2 2 0 0 0 3.4 0",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4",
  dot: "M12 12h.01",
};

export function Ic({ n, s = 20 }: { n: string; s?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(P[n] || P.dot).split("|").map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
