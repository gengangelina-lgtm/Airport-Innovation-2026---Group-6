import { useEffect, useRef, useState } from "react";
import { sameDay, scenarios } from "./data/repoData";
import type { ScenarioEntry } from "./data/repoData";
import { KIND_LABEL, fmtDay } from "./dates";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Header button + month calendar for choosing an operating day (scenario). */
export default function ScenarioCalendar({ current, onSelect }: { current: ScenarioEntry; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(current.date.getFullYear(), current.date.getMonth(), 1));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7) cells.push(null);
  const [today] = useState(() => new Date());
  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="calendar-picker" ref={ref}>
      <button
        className="calendar-button"
        onClick={() => {
          setMonth(new Date(current.date.getFullYear(), current.date.getMonth(), 1));
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
        <span>
          <small>
            OPERATING DAY · <em className={`kind ${current.kind}`}>{KIND_LABEL[current.kind]}</em>
          </small>
          <b>
            {fmtDay(current.date)} · {current.label}
          </b>
        </span>
      </button>
      {open && (
        <div className="calendar-pop" role="dialog" aria-label="Choose an operating day">
          <div className="calendar-head">
            <button onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <b>{fmtDay(month, { month: "long", year: "numeric" })}</b>
            <button onClick={() => shiftMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="calendar-grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="weekday">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const entry = scenarios.find((s) => sameDay(s.date, d));
              const selected = sameDay(d, current.date);
              const isToday = sameDay(d, today);
              return (
                <button
                  key={i}
                  className={`day ${entry ? entry.kind : "empty"} ${selected ? "selected" : ""} ${isToday ? "is-today" : ""}`}
                  disabled={!entry}
                  title={entry ? `${KIND_LABEL[entry.kind]} · ${entry.label}` : "No schedule on file"}
                  onClick={() => {
                    if (!entry) return;
                    onSelect(entry.id);
                    setOpen(false);
                  }}
                >
                  <b>{d.getDate()}</b>
                  {entry && <small>{entry.label}</small>}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span><i className="history" /> History · completed, read only</span>
            <span><i className="today" /> Today · live</span>
            <span><i className="planned" /> Planned · forecast</span>
          </div>
        </div>
      )}
    </div>
  );
}
