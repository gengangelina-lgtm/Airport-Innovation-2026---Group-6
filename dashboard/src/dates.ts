import type { DayKind } from "./data/repoData";

export const KIND_LABEL: Record<DayKind, string> = { history: "History", today: "Today", planned: "Planned" };

export const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  d.toLocaleDateString("en-CA", opts);
