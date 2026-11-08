import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fmt, fmtInterval } from "./engine/model";
import type { Interval } from "./engine/model";
import { simulate, tickAt } from "./engine/simulate";
import type { FlightView, Pin, SimResult, Tick } from "./engine/simulate";
import { scenarios, staticInfo } from "./data/repoData";
import { PEARSON_MAP } from "./data/pearsonMap";
import { fmtGps, planePositions } from "./mapGeometry";
import type { PlaneDot } from "./mapGeometry";
import type { ScenarioEntry } from "./data/repoData";
import ScenarioCalendar from "./ScenarioCalendar";
import { KIND_LABEL, fmtDay } from "./dates";
import {
  CAUSE_LABEL,
  allMoves,
  defaultMinute,
  delayLabel,
  gateBlocker,
  gateOptions,
  gateRows,
  outageMessage,
  restoreMessage,
  retimeMessage,
  suggestionReason,
  unassignedFlights,
  whyUnassigned,
  windowLabel,
  withInjections,
  friendlyLog,
  conflictText,
  plainIds,
} from "./ops";
import type { GateRow, Injection } from "./ops";

type Page = "current" | "schedule" | "unassigned" | "planes";
type ModalState = { flightId: string; mode: "current" | "incoming" | "assign" } | null;

/* ---------------------------------------------------------------- Icons */

const iconPaths: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.7 20h18.6Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  plane: <path d="M22 16.5 13.5 14V21l-2 1-2.5-9-6.5-2V9l6.5-.5 2.5-6.5 2 1v5.5L22 6Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  back: (
    <>
      <path d="m9 14-4-4 4-4" />
      <path d="M5 10h8a5 5 0 0 1 5 5v1" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m15 8 4 4-4 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  play: <path d="M7 5v14l12-7Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z" />,
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
};

/** HermesTC logo: silhouette of an air-traffic control tower (radome, glass cab, shaft). */
function TowerLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="2.65 0.25 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.4 1.2v3.6M15.6 1.6v3.2" fill="none" stroke="currentColor" strokeWidth=".35" strokeLinecap="round" />
      <circle cx="12" cy="3.7" r="2.4" />
      <rect x="10.5" y="5.7" width="3" height=".9" />
      <path fillRule="evenodd" d="M7.1 6.6h9.8l.8 1.1-.9 2.7H7.2l-.9-2.7ZM8 7.9h2.4v1.6H8.3ZM11 7.9h2v1.6h-2ZM13.6 7.9H16l-.3 1.6h-2.1Z" />
      <path d="M7.4 10.8h9.2v1.8l-1.5 2H8.9l-1.5-2Z" />
      <path d="M10.5 14.6h3v7.9h-3Z" />
      <path d="M6.5 22.4h11v.9h-11Z" />
      <path transform="translate(17.2 0.9) rotate(45 2.75 2.75) scale(.55)" d="M5 0c.6 0 .9.7.9 1.5V4L10 6.3v1.1L5.9 6.2v2.4l1.3 1v.7L5 9.7l-2.2.6v-.7l1.3-1V6.2L0 7.4V6.3L4.1 4V1.5C4.1.7 4.4 0 5 0Z" />
    </svg>
  );
}

function Icon({ name, size = 18 }: { name: keyof typeof iconPaths; size?: number }) {
  return (
    <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const clockLabel = (m: number) => fmt(((m % 1440) + 1440) % 1440);
const countdown = (mins: number) => `${pad(Math.floor(Math.abs(mins) / 60))}:${pad(Math.abs(mins) % 60)}:00`;
const gateTypeShort = (t: number) => ["CARGO", "DOMESTIC", "INTL"][t] ?? "GATE";

/* ------------------------------------------------------------ Shared bits */

function FlightDetails({ entry, label }: { entry?: { flight: FlightView; window: Interval }; label: string }) {
  if (!entry)
    return (
      <div className="flight">
        <span className="eyebrow">{label}</span>
        <strong className="open-label">OPEN</strong>
        <span>{label === "CURRENT" ? "Available now" : "Nothing scheduled"}</span>
      </div>
    );
  const { flight, window } = entry;
  const delay = delayLabel(flight);
  return (
    <div className="flight">
      <span className="eyebrow">{label}</span>
      <div className="flight-title">
        {flight.diversion && (
          <span className="emergency">
            <Icon name="alert" size={14} /> {flight.reason ?? "Emergency"}
          </span>
        )}
        {flight.strandedAt && (
          <span className="emergency">
            <Icon name="alert" size={14} /> Needs new gate
          </span>
        )}
        <strong>{flight.code}</strong>
      </div>
      <div className="flight-meta">
        <span>{flight.route}</span>
        <i /> <span>{flight.aircraftName}</span>
        <i /> <span>{flight.categoryName}</span>
      </div>
      <strong className="time">{fmtInterval(window)}</strong>
      {delay && (
        <span className="delay">
          DELAY <b>{delay}</b>
        </span>
      )}
      {flight.equipmentChanged && (
        <span className="delay">
          EQUIPMENT <b>was {flight.equipmentChanged}</b>
        </span>
      )}
    </div>
  );
}

function Sidebar({
  page,
  setPage,
  count,
  sim,
}: {
  page: Page;
  setPage: (p: Page) => void;
  count: number;
  sim: SimResult;
}) {
  const navItems: { id: Page; label: string; icon: keyof typeof iconPaths }[] = [
    { id: "current", label: "Current Hour", icon: "clock" },
    { id: "schedule", label: "Full Day Schedule", icon: "calendar" },
    { id: "unassigned", label: "Unassigned Flights", icon: "alert" },
    { id: "planes", label: "Planes at Pearson", icon: "plane" },
  ];
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => setPage("current")} aria-label="Go to current gate status">
        <span className="brand-mark" aria-hidden="true">
          <TowerLogo size={32} />
        </span>
        <span>
          <b>HermesTC</b>
        </span>
      </button>
      <nav>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
            aria-current={page === item.id ? "page" : undefined}
            title={item.label}
          >
            <span className="nav-icon">
              <Icon name={item.icon} />
            </span>
            <span>
              <b>{item.label}</b>
            </span>
            {item.id === "unassigned" && count > 0 && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <strong className={sim.status === "OK" ? "" : "failed"}>
          {sim.status === "OK" ? "Operational" : "Gate conflict"}
        </strong>
      </div>
    </aside>
  );
}

function AppHeader({
  minute,
  scenario,
  setScenarioId,
}: {
  minute: number;
  scenario: ScenarioEntry;
  setScenarioId: (id: string) => void;
}) {
  const day = Math.floor(minute / 1440);
  return (
    <div className="topbar">
      <div>
        <span className="airport-code">YYZ</span>
        <span className="divider" />
        Toronto Pearson International Airport
      </div>
      <div className="top-clock">
        <strong>{clockLabel(minute)}</strong>
        <span>
          {fmtDay(scenario.date, { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}
          {day > 0 ? ` · +${day}D` : ""} · {KIND_LABEL[scenario.kind].toUpperCase()}
        </span>
      </div>
      <ScenarioCalendar current={scenario} onSelect={setScenarioId} />
    </div>
  );
}

function SimBar({
  sim,
  minute,
  setMinute,
  range,
  playing,
  setPlaying,
  changes,
  reset,
}: {
  sim: SimResult;
  minute: number;
  setMinute: (m: number) => void;
  range: [number, number];
  playing: boolean;
  setPlaying: (p: boolean) => void;
  changes: number;
  reset: () => void;
}) {
  const pct = (m: number) => ((m - range[0]) / (range[1] - range[0])) * 100;
  return (
    <div className="sim-bar">
      <button className="play-button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause simulation" : "Play simulation"}>
        <Icon name={playing ? "pause" : "play"} size={16} />
      </button>
      <span className="sim-time">{fmt(range[0])}</span>
      <div className="sim-track">
        <input
          type="range"
          min={range[0]}
          max={range[1]}
          step={5}
          value={minute}
          onChange={(e) => setMinute(Number(e.target.value))}
          aria-label="Simulation time"
        />
        {sim.ticks.filter((t, i) => i === 0 || t.time <= minute).map((t, i, shown) => (
          <button
            key={t.time}
            className={`tick-mark ${i > 0 && pct(t.time) - pct(shown[i - 1].time) < 6 ? "compact" : ""}`}
            style={{ left: `${pct(t.time)}%` }}
            title={`${fmt(t.time)} — ${t.log[0] ?? "update"}`}
            onClick={() => setMinute(t.time)}
          >
            {fmt(t.time)}
          </button>
        ))}
      </div>
      <span className="sim-time">{fmt(range[1])}</span>
      {changes > 0 && (
        <button className="reset-button" onClick={reset} title="Remove all operator changes">
          <Icon name="reset" size={14} /> Reset {changes} change{changes > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder, shortcut }: { value: string; onChange: (v: string) => void; placeholder: string; shortcut?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);
  return (
    <label className="search">
      <Icon name="search" />
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {shortcut && <kbd>⌘ K</kbd>}
    </label>
  );
}

/* ------------------------------------------------------- Current Hour page */

function GateNote({ row }: { row: GateRow }) {
  const strandedNote = row.stranded && row.current
    ? {
        title: "Needs a new gate",
        sub:
          row.stranded === "outage"
            ? `${row.current.flight.code} on stand · gate out of service`
            : row.stranded === "incompatible"
              ? `${row.current.flight.code} no longer fits this gate`
              : `${row.current.flight.code} must vacate for another flight`,
      }
    : null;
  const note =
    strandedNote ??
    (row.outage && row.current
      ? { title: "Conflict", sub: `${row.current.flight.code} on stand during outage` }
      : row.movedFrom
        ? { title: `Moved from ${row.movedFrom.gate}`, sub: row.movedFrom.cause }
        : row.outage
          ? { title: "Out of service", sub: `Until ${fmt(row.outage[1])}` }
          : row.upcomingOutage
            ? { title: `Outage at ${fmt(row.upcomingOutage[0])}`, sub: "Planned unavailability" }
            : null);
  if (!note) return null;
  const isMove = !strandedNote && !(row.outage && row.current) && !!row.movedFrom;
  return (
    <div className={`reassign-note ${isMove ? "moved" : ""}`}>
      <b>{note.title}</b>
      <span>{note.sub}</span>
    </div>
  );
}

function GateButtons({
  row,
  readOnly,
  openFlight,
  fillGate,
  markOutage,
  restoreGate,
}: {
  row: GateRow;
  readOnly: boolean;
  openFlight: (id: string, mode: "current" | "incoming") => void;
  fillGate: (gate: string, slot: "current" | "incoming") => void;
  markOutage: (gate: string) => void;
  restoreGate: (gate: string) => void;
}) {
  const lock = readOnly ? "Past operating days are read only" : undefined;
  const open = (slot: "current" | "incoming") => {
    const entry = row[slot];
    if (entry) openFlight(entry.flight.id, slot);
    else fillGate(row.gate.id, slot);
  };
  return (
    <div className="gate-buttons">
      <button
        className="action-button"
        disabled={readOnly && !row.current}
        title={lock ?? (row.current ? "Move the current flight to another gate" : `Put a flight on ${row.gate.id} now`)}
        onClick={() => open("current")}
      >
        {readOnly ? "View Current Flight" : "Current Manual Update"}
      </button>
      <button
        className="incoming-button"
        disabled={readOnly && !row.incoming}
        title={lock ?? (row.incoming ? "Update the incoming flight" : `Schedule an incoming flight at ${row.gate.id}`)}
        onClick={() => open("incoming")}
      >
        {readOnly ? "View Incoming Flight" : "Incoming Manual Update"}
      </button>
      {!readOnly &&
        (row.outage ? (
          <button className="restore-button" onClick={() => restoreGate(row.gate.id)} title="End the outage now and make this gate available again">
            <Icon name="reset" size={12} /> Put back in service
          </button>
        ) : (
          <button className="link-button" onClick={() => markOutage(row.gate.id)} title="Report this gate unavailable for the next 2 hours; affected flights are re-planned automatically">
            <Icon name="wrench" size={12} /> Mark out of service
          </button>
        ))}
    </div>
  );
}

/** Gates with something changed sort to the top: conflicts/outages, then moves and emergencies. */
const changeRank = (r: GateRow) => (r.outage || r.stranded ? 0 : r.status === "alert" ? 1 : r.upcomingOutage ? 2 : 3);

function CurrentPage({
  rows,
  scenario,
  readOnly,
  mapView,
  setMapView,
  openFlight,
  fillGate,
  markOutage,
  restoreGate,
  openGate,
  planes,
}: {
  rows: GateRow[];
  scenario: ScenarioEntry;
  readOnly: boolean;
  mapView: boolean;
  setMapView: (v: boolean) => void;
  openFlight: (id: string, mode: "current" | "incoming") => void;
  fillGate: (gate: string, slot: "current" | "incoming") => void;
  markOutage: (gate: string) => void;
  restoreGate: (gate: string) => void;
  openGate: (gate: string) => void;
  planes: PlaneDot[];
}) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();
  const filtered = rows.filter((r) =>
    [r.gate.id, r.current?.flight.code, r.current?.flight.route, r.incoming?.flight.code, r.incoming?.flight.route, r.current?.flight.aircraftName, r.incoming?.flight.aircraftName]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );

  return (
    <div className={`current-page ${mapView ? "map-mode" : ""}`}>
      <section className="page-head">
        <div>
          <span className="kicker">{scenario.kind === "history" ? "HISTORICAL GATE OPERATIONS" : scenario.kind === "planned" ? "PLANNED GATE OPERATIONS" : "LIVE GATE OPERATIONS"}</span>
          <h1>Current Gate Status</h1>
          <p>
            Toronto Pearson · {fmtDay(scenario.date, { weekday: "long", month: "long", day: "numeric" })} · {rows.length} gates · {scenario.label}
          </p>
        </div>
        <div className="view-toggle" aria-label="View controls">
          <button className={!mapView ? "selected" : ""} onClick={() => setMapView(false)}>
            <Icon name="list" /> List
          </button>
          <button className={mapView ? "selected" : ""} onClick={() => setMapView(true)}>
            <Icon name="map" /> Display Map
          </button>
        </div>
      </section>
      <div className="controls-row">
        <SearchBox value={query} onChange={setQuery} placeholder="Search flight, route, aircraft or gate" shortcut />
        <div className="legend">
          <span><i className="dot occupied" /> Occupied</span>
          <span><i className="dot open" /> Open</span>
          <span><i className="dot alert-dot" /> Alert</span>
          <span><i className="dot outage" /> Outage</span>
        </div>
      </div>
      {mapView ? (
        <AirportMap rows={filtered} openGate={openGate} planes={planes} />
      ) : (
        <div className="gate-list">
          <div className="list-labels">
            <span>GATE</span>
            <span>CURRENT FLIGHT</span>
            <span>INCOMING FLIGHT</span>
            <span>ACTION</span>
          </div>
          {[...filtered]
            .sort((x, y) => changeRank(x) - changeRank(y))
            .map((row) => {
            const g = row.gate;
            return (
              <article key={g.id} className={`gate-card ${row.status} ${row.pulse ? "manual-action" : ""}`}>
                <button className="gate-block" onClick={() => openGate(g.id)} title={`Open gate ${g.id} details`}>
                  <small>{gateTypeShort(g.gate_type)}</small>
                  <strong>{g.id}</strong>
                  <em className="gate-spec">
                    {g.max_wingspan}m · {g.jetbridge ? "Bridge" : "Stairs"}
                  </em>
                  {row.status === "outage" && <span>OUTAGE</span>}
                </button>
                <FlightDetails entry={row.current} label="CURRENT" />
                <FlightDetails entry={row.incoming} label="INCOMING" />
                <div className="gate-action">
                  <GateNote row={row} />
                  <GateButtons row={row} readOnly={readOnly} openFlight={openFlight} fillGate={fillGate} markOutage={markOutage} restoreGate={restoreGate} />
                </div>
              </article>
            );
          })}
          {!filtered.length && (
            <div className="empty-state">
              <Icon name="search" size={28} />
              <h3>No matching flights</h3>
              <p>Try a flight number, route, aircraft type or gate.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Map */


type Seg = { a: readonly number[]; b: readonly number[]; label: readonly number[] };
const MAP_W = PEARSON_MAP.width;
const MAP_H = PEARSON_MAP.height;
const GATE_SEGS = PEARSON_MAP.gates as Record<string, Seg>;

/** Gate edge on the real terminal outline; unknown gates go on a row of remote stands. */
const segmentFor = (id: string, i: number): Seg =>
  GATE_SEGS[id] ?? { a: [120 + i * 70, MAP_H - 80], b: [160 + i * 70, MAP_H - 80], label: [140 + i * 70, MAP_H - 50] };

function AirportMap({ rows, openGate, planes }: { rows: GateRow[]; openGate: (gate: string) => void; planes: PlaneDot[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const [hoverPlane, setHoverPlane] = useState<string | null>(null);
  const plane = planes.find((p) => p.flight.id === hoverPlane);
  const hovered = rows.find((r) => r.gate.id === hover);
  const tone = (r: GateRow) => (r.status === "outage" ? "outage" : r.status === "alert" ? "alert" : r.current ? "occupied" : "open");

  return (
    <div className="map-panel">
      <div className="map-title">
        <span>
          <b>Pearson Airport Gate Map</b>
          <small>Terminal overview · {rows.length} monitored gates</small>
        </span>
        <span className="map-instruction">
          <i className="plane-key" /> Aircraft on runway / taxiways ({planes.length}) · hover for details · click a gate for gate details · Map
          data © OpenStreetMap contributors
        </span>
      </div>
      <div className="airport-map" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        <svg className="map-schematic" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Overhead map of Toronto Pearson with gates">
          <rect width={MAP_W} height={MAP_H} fill="#0a2440" />
          <g fill="none" stroke="#1d3f60" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            {PEARSON_MAP.taxiways.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g fill="#3a4f63" stroke="none">
            {PEARSON_MAP.runways.map((r, i) => (
              <path key={i} d={r.d} fill="none" stroke="#32485d" strokeWidth={60 / PEARSON_MAP.metersPerPx} strokeLinecap="butt" />
            ))}
          </g>
          <g fill="#13304d" stroke="#21476b" strokeWidth="1.5">
            {PEARSON_MAP.aprons.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <path d={PEARSON_MAP.cargoApron} fill="#1a3a58" stroke="#3b6489" strokeWidth="2" />
          <g fill="#1b3a57" stroke="#3b6489" strokeWidth="1.5">
            {PEARSON_MAP.hangars.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g fill="#2a5277" stroke="#7fa6c6" strokeWidth="2.5" strokeLinejoin="round" fillRule="evenodd">
            {PEARSON_MAP.terminals.map((t) => (
              <path key={t.name} d={t.d} />
            ))}
          </g>
          <g fill="#b9d2e6" fontFamily="Inter, Arial, sans-serif" fontSize="17" fontWeight="800" letterSpacing="3" textAnchor="middle">
            {PEARSON_MAP.labels.map((l) => (
              <text key={l.text} x={l.at[0]} y={l.at[1]}>
                {l.text}
              </text>
            ))}
          </g>
          {rows.map((r, i) => {
            const { a, b, label } = segmentFor(r.gate.id, i);
            const t = tone(r);
            return (
              <g
                key={r.gate.id}
                className={`gate-edge ${t} ${hover === r.gate.id ? "hovered" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`Gate ${r.gate.id}: ${r.current?.flight.code ?? (r.outage ? "out of service" : "open")}. Open details`}
                onClick={() => openGate(r.gate.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openGate(r.gate.id))}
                onMouseEnter={() => setHover(r.gate.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r.gate.id)}
                onBlur={() => setHover(null)}
              >
                <line className="hit" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                <line className="glow" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                <line className="edge-line" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                <text className="edge-label" x={label[0]} y={label[1] + 6} textAnchor="middle">
                  {r.gate.id}
                </text>
              </g>
            );
          })}
          {planes.map((p) => (
            <g
              key={p.flight.id}
              className={`plane-dot ${p.phase} ${hoverPlane === p.flight.id ? "hovered" : ""}`}
              transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
              tabIndex={0}
              role="img"
              aria-label={`${p.flight.code}: ${p.status}`}
              onMouseEnter={() => setHoverPlane(p.flight.id)}
              onMouseLeave={() => setHoverPlane(null)}
              onFocus={() => setHoverPlane(p.flight.id)}
              onBlur={() => setHoverPlane(null)}
            >
              <circle className="halo" r="22" />
              <circle className="core" r="9" />
            </g>
          ))}
        </svg>
        {plane && (
          <div className="gate-tooltip plane-tooltip" style={{ left: `${(plane.x / MAP_W) * 100}%`, top: `${(plane.y / MAP_H) * 100}%` }}>
            <b>
              {plane.flight.code} · {plane.flight.route}
            </b>
            <small>
              {plane.flight.aircraftName} · {plane.flight.categoryName}
            </small>
            <small>{plane.status}</small>
            <em>GPS {fmtGps(plane.lat, plane.lon)}</em>
          </div>
        )}
        {!plane && hovered &&
          (() => {
            const i = rows.indexOf(hovered);
            const sg = segmentFor(hovered.gate.id, i);
            const mid = [(sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2];
            return (
              <div className="gate-tooltip" style={{ left: `${(mid[0] / MAP_W) * 100}%`, top: `${(mid[1] / MAP_H) * 100}%` }}>
                <b>
                  {hovered.gate.id} · {hovered.current?.flight.code || (hovered.outage ? "Out of service" : "Open")}
                </b>
                <small>
                  {hovered.current
                    ? `${fmtInterval(hovered.current.window)} · ${hovered.current.flight.aircraftName}`
                    : hovered.outage
                      ? `Unavailable until ${fmt(hovered.outage[1])}`
                      : `${hovered.gate.typeName} · max ${hovered.gate.max_wingspan}m`}
                </small>
                {hovered.incoming && (
                  <small>
                    Incoming {hovered.incoming.flight.code} · {fmtInterval(hovered.incoming.window)}
                  </small>
                )}
                <em>Click for gate details</em>
              </div>
            );
          })()}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Gate details */

function GateDetailPage({
  sim,
  tick,
  minute,
  row,
  readOnly,
  back,
  backLabel,
  openFlight,
  fillGate,
  markOutage,
  restoreGate,
}: {
  sim: SimResult;
  tick: Tick | null;
  minute: number;
  row: GateRow;
  readOnly: boolean;
  back: () => void;
  backLabel: string;
  openFlight: (id: string, mode: "current" | "incoming") => void;
  fillGate: (gate: string, slot: "current" | "incoming") => void;
  markOutage: (gate: string) => void;
  restoreGate: (gate: string) => void;
}) {
  const g = row.gate;
  const ids = tick?.plan[g.id] ?? [];
  const visits = ids
    .flatMap((id) => tick!.flights[id].intervals.map((w) => ({ f: tick!.flights[id], w })))
    .sort((a, b) => a.w[0] - b.w[0]);
  const moves = tick ? allMoves(sim, tick).filter((m) => m.from === g.id || m.to === g.id) : [];
  const outages = tick?.outages[g.id] ?? [];
  const hStart = Math.floor(sim.timeMin / 60);
  const hEnd = Math.max(hStart + 8, Math.ceil(sim.timeMax / 60));
  const span = (hEnd - hStart) * 60;
  const hours = Array.from({ length: hEnd - hStart }, (_, i) => hStart + i);
  const pos = (m: number) => Math.min(100, Math.max(0, ((m - hStart * 60) / span) * 100));

  const statusLabel = row.stranded
    ? row.stranded === "outage"
      ? "Out of service · aircraft on stand"
      : row.stranded === "incompatible"
        ? "Incompatible aircraft on stand"
        : "Aircraft must vacate"
    : row.outage
      ? "Out of service"
      : row.current
        ? "Occupied"
        : "Open";

  return (
    <div className="gate-detail">
      <button className="back-button" onClick={back} title="Return to where you were (Esc)">
        <Icon name="back" size={16} /> {backLabel}
      </button>
      <section className="page-head">
        <div>
          <span className="kicker">GATE DETAILS</span>
          <h1>Gate {g.id}</h1>
        </div>
        <div className={`gate-status-chip ${row.status} ${row.current ? "busy" : ""}`}>
          {statusLabel}
        </div>
      </section>

      <div className="detail-stats">
        <div><small>TYPE</small><b>{g.typeName}</b></div>
        <div><small>MAX WINGSPAN</small><b>{g.max_wingspan}m</b></div>
        <div><small>BOARDING</small><b>{g.jetbridge ? "Jetbridge" : "Stairs"}</b></div>
        <div><small>PASSENGER WALK DISTANCE</small><b>{g.dist > 0 ? `${g.dist}m` : "—"}</b></div>
        <div><small>USE TODAY</small><b>{visits.length} visits</b></div>
      </div>


      <div className="detail-flights">
        {(["current", "incoming"] as const).map((k) => {
          const entry = row[k];
          return (
            <div className="detail-card" key={k}>
              <FlightDetails entry={entry} label={k === "current" ? "CURRENT" : "INCOMING"} />
              {entry && <p className="fit-note">{entry.flight.jetbridge ? "needs jetbridge" : "no jetbridge needed"} · {entry.flight.wingspan}m span</p>}
            </div>
          );
        })}
        <div className="detail-card actions">
          <span className="eyebrow">ACTIONS</span>
          <GateNote row={row} />
          <GateButtons row={row} readOnly={readOnly} openFlight={openFlight} fillGate={fillGate} markOutage={markOutage} restoreGate={restoreGate} />
        </div>
      </div>

      <div className="timeline-card detail-timeline">
        <div className="timeline-key" style={{ gridTemplateColumns: `75px repeat(${hours.length}, 1fr)` }}>
          <b>{g.id}</b>
          {hours.map((h) => (
            <span key={h}>{clockLabel(h * 60)}</span>
          ))}
        </div>
        <div className="timeline-body">
          {pos(minute) > 0 && pos(minute) < 100 && (
            <div className="now-line" style={{ left: `calc(75px + (100% - 75px) * ${pos(minute) / 100})` }}>
              <span>NOW {clockLabel(minute)}</span>
            </div>
          )}
          <div className="timeline-row">
            <b>{g.id}</b>
            <div className="track" style={{ backgroundSize: `${100 / hours.length}% 100%` }}>
              {outages.map((w, i) => (
                <div key={i} className="outage-bar" style={{ left: `${pos(w[0])}%`, right: `${100 - pos(w[1])}%` }}>
                  OUTAGE
                </div>
              ))}
              {visits.map(({ f, w }) => (
                <button
                  key={`${f.id}-${w[0]}`}
                  className={`flight-bar ${f.diversion ? "alert" : f.delayMin > 0 ? "delay" : f.category === 0 ? "locked" : f.category === 2 ? "navy" : "blue"}`}
                  style={{ left: `${pos(w[0])}%`, width: `${pos(w[1]) - pos(w[0])}%` }}
                  onClick={() => openFlight(f.id, w[0] > minute ? "incoming" : "current")}
                  title={`${f.code} · ${fmtInterval(w)}`}
                >
                  <b>{f.code}</b>
                  <small>{fmtInterval(w)}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="planes-table detail-table">
        <div className="planes-table-head">
          <span>FLIGHT / ROUTE</span>
          <span>AIRCRAFT</span>
          <span>GATE WINDOW</span>
          <span>TYPE</span>
          <span>STATUS</span>
        </div>
        {visits.map(({ f, w }) => {
          const [state, tone] = w[1] <= minute ? ["Completed", "locked-done"] : w[0] <= minute ? ["On stand", "normal"] : ["Upcoming", "upcoming"];
          return (
            <article className="plane-row" key={`${f.id}-${w[0]}`}>
              <div className="plane-identity">
                <span className="plane-badge small">
                  <Icon name="plane" />
                </span>
                <span>
                  <b>{f.code}</b>
                  <small>{f.route}</small>
                </span>
              </div>
              <span className="plane-type">
                {f.aircraftName}
                <small>{f.categoryName}</small>
              </span>
              <span className="plane-window">{fmtInterval(w)}</span>
              <span className="plane-type">{f.categoryName}</span>
              <span className={`plane-state ${tone}`}>
                {f.diversion ? `Emergency · ${state}` : state}
              </span>
            </article>
          );
        })}
        {!visits.length && (
          <div className="empty-state">
            <h3>No flights at {g.id}</h3>
            <p>Nothing is assigned to this gate on this operating day.</p>
          </div>
        )}
      </div>

      {(moves.length > 0 || outages.length > 0) && (
        <div className="ops-log">
          <div className="ops-log-head">
            <b>Gate history</b>
            <small>Outages and reassignments involving {g.id}</small>
          </div>
          <div className="ops-tick">
            <time>{g.id}</time>
            <ul>
              {outages.map((w, i) => (
                <li key={`o${i}`} className="outage">
                  [OUTAGE] Unavailable {fmtInterval(w)}
                </li>
              ))}
              {moves.map((m) => (
                <li key={`${m.flight}-${m.time}`} className="reassign">
                  [{fmt(m.time)}] {tick!.flights[m.flight]?.code} {m.to === g.id ? `moved in from ${m.from}` : `moved out to ${m.to}`} · {CAUSE_LABEL[m.cause]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Schedule page */

function SchedulePage({ sim, tick, minute, kind, openFlight }: { sim: SimResult; tick: Tick | null; minute: number; kind: ScenarioEntry["kind"]; openFlight: (id: string) => void }) {
  const hStart = Math.floor(sim.timeMin / 60);
  const hEnd = Math.max(hStart + 8, Math.ceil(sim.timeMax / 60));
  const span = (hEnd - hStart) * 60;
  const hours = Array.from({ length: hEnd - hStart }, (_, i) => hStart + i);
  const pos = (m: number) => Math.min(100, Math.max(0, ((m - hStart * 60) / span) * 100));
  const flights = tick ? Object.values(tick.flights) : [];
  const live = flights.filter((f) => !f.cancelled && f.intervals.length);
  const stats = {
    total: flights.length,
    completed: live.filter((f) => f.intervals.every((w) => w[1] <= minute)).length,
    upcoming: live.filter((f) => f.intervals.some((w) => w[1] > minute)).length,
    delayed: live.filter((f) => f.delayMin > 0).length,
    cancelled: flights.filter((f) => f.cancelled).length,
    action: unassignedFlights(tick).length,
  };
  const moves = tick ? allMoves(sim, tick) : [];
  const nowPct = pos(minute);
  const cols = { gridTemplateColumns: `75px repeat(${hours.length}, 1fr)` };
  const tone = (f: FlightView) => (f.diversion ? "alert" : f.delayMin > 0 ? "delay" : f.category === 0 ? "locked" : f.category === 2 ? "navy" : "blue");
  return (
    <>
      <section className="page-head schedule-head">
        <div>
          <span className="kicker">DAILY PLANNING</span>
          <h1>Full Day Schedule</h1>
          <p>
            Terminal gate movements · {stats.total} flights filed · plan as of {tick ? fmt(tick.time) : "—"}
          </p>
        </div>
      </section>
      <div className="schedule-stats">
        <span><b>{stats.completed}</b> completed</span>
        <span><b>{stats.upcoming}</b> active / upcoming</span>
        <span className="delay-stat"><b>{stats.delayed}</b> delayed</span>
        <span><b>{stats.cancelled}</b> cancelled</span>
        {stats.action > 0 && <span className="alert-stat"><b>{stats.action}</b> require action</span>}
        {kind !== "today" && (
          <span className={`day-chip ${kind}`}>
            <Icon name={kind === "history" ? "lock" : "clock"} size={13} /> {kind === "history" ? "Historical schedule · read only" : "Planned schedule · forecast"}
          </span>
        )}
      </div>
      <div className="timeline-card">
        <div className="timeline-key" style={cols}>
          <b>GATE</b>
          {hours.map((h) => (
            <span key={h}>{clockLabel(h * 60)}</span>
          ))}
        </div>
        <div className="timeline-body">
          {nowPct > 0 && nowPct < 100 && (
            <div className="now-line" style={{ left: `calc(75px + (100% - 75px) * ${nowPct / 100})` }}>
              <span>NOW {clockLabel(minute)}</span>
            </div>
          )}
          {sim.gates.map((g) => (
            <div className="timeline-row" key={g.id}>
              <b title={`${g.typeName} · max ${g.max_wingspan}m · ${g.jetbridge ? "jetbridge" : "no jetbridge"}`}>
                {g.id}
                <small>{gateTypeShort(g.gate_type)}</small>
              </b>
              <div className="track" style={{ backgroundSize: `${100 / hours.length}% 100%` }}>
                {(tick?.outages[g.id] ?? []).map((w, i) => (
                  <div key={i} className="outage-bar" style={{ left: `${pos(w[0])}%`, right: `${100 - pos(w[1])}%` }} title={`Outage ${fmt(w[0])}–${fmt(w[1])}`}>
                    OUTAGE
                  </div>
                ))}
                {moves
                  .filter((m) => m.from === g.id && tick?.flights[m.flight])
                  .map((m) => {
                    const f = tick!.flights[m.flight];
                    const w = f.intervals[0];
                    return (
                      <span key={`${m.flight}-${m.time}`} className="ghost-bar" style={{ left: `${pos(w[0])}%`, width: `${pos(w[1]) - pos(w[0])}%` }} title={`${f.code} moved to ${m.to} at ${fmt(m.time)} · ${CAUSE_LABEL[m.cause]}`}>
                        {f.code} · MOVED
                      </span>
                    );
                  })}
                {(tick?.plan[g.id] ?? []).flatMap((id) => {
                  const f = tick!.flights[id];
                  return f.intervals.map((w, i) => {
                    const done = w[1] <= minute;
                    return (
                      <button
                        key={`${id}-${i}`}
                        className={`flight-bar ${tone(f)}`}
                        style={{ left: `${pos(w[0])}%`, width: `${pos(w[1]) - pos(w[0])}%` }}
                        disabled={done}
                        title={`${f.code} · ${f.route} · ${f.aircraftName} · ${fmtInterval(w)}${done ? " · completed" : ""}`}
                        onClick={() => openFlight(id)}
                      >
                        <b>{f.code}</b>
                        <small>{fmtInterval(w)}</small>
                      </button>
                    );
                  });
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="timeline-note">
          <span className="swatch blue" /> Domestic <span className="swatch navy" /> International <span className="swatch cargo" /> Cargo
          <span className="swatch delay" /> Delayed <span className="swatch alert" /> Emergency
          <span className="hatch-sample" /> Gate outage <span className="ghost-sample" /> Former assignment <span className="line-sample" /> Current time
        </div>
      </div>
      <OpsLog sim={sim} minute={minute} />
    </>
  );
}

function OpsLog({ sim, minute }: { sim: SimResult; minute: number }) {
  const ticks = sim.ticks.filter((t) => t.time <= minute).reverse();
  return (
    <div className="ops-log">
      <div className="ops-log-head">
        <b>Operations log</b>
        <small>Gate changes and events, newest first</small>
      </div>
      {!ticks.length && <p className="ops-empty">No updates yet — move the clock past {fmt(sim.ticks[0]?.time)}.</p>}
      {ticks.map((t) => (
        <div className="ops-tick" key={t.time}>
          <time>{fmt(t.time)}</time>
          <ul>
            {t.log.map((l, i) => {
              const e = friendlyLog(l);
              return e && <li key={i} className={e.tone}>{e.text}</li>;
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- Unassigned page */

function UnassignedPage({ sim, tick, minute, openAssign }: { sim: SimResult; tick: Tick | null; minute: number; openAssign: (id: string) => void }) {
  const flights = unassignedFlights(tick);
  return (
    <>
      <section className="page-head">
        <div>
          {flights.length > 0 ? <span className="kicker alert-kicker">ACTION REQUIRED</span> : <span className="kicker clear-kicker">ALL CLEAR</span>}
          <h1>Unassigned Flights</h1>
          <p>Flights without a confirmed gate</p>
        </div>
        <div className={`attention-count ${flights.length ? "" : "clear"}`}>
          <b>{flights.length}</b>
          <span>{flights.length ? "NEED ASSIGNMENT" : "UNASSIGNED"}</span>
        </div>
      </section>
      <div className="notice">
        <Icon name="alert" />
        <span>
          <b>Assignment window</b> Flights must have a confirmed gate before their gate window begins. Emergency diversions take priority.
        </span>
      </div>
      <div className="unassigned-list">
        {tick &&
          flights.map((f) => {
            const due = f.intervals[0][0] - minute;
            const urgent = f.diversion || due <= 60;
            return (
              <article className={`unassigned-card ${urgent ? "urgent" : ""}`} key={f.id}>
                <div className="plane-badge">
                  <Icon name="plane" size={28} />
                </div>
                <div className="unassigned-main">
                  <span className="eyebrow">{f.diversion ? `EMERGENCY · ${f.reason?.toUpperCase()}` : "UNASSIGNED FLIGHT"}</span>
                  <h2>
                    {f.code} <small>{f.route}</small>
                  </h2>
                  <div className="flight-meta">
                    <span>{f.aircraftName}</span>
                    <i />
                    <span>{f.categoryName}</span>
                    <i />
                    <span>{f.intervals.map(fmtInterval).join(", ")}</span>
                    {f.strandedAt && (
                      <>
                        <i />
                        <span>On stand at {f.strandedAt.gate}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="reason-box">
                  <small>REASON</small>
                  <b>{whyUnassigned(sim, tick, f)}</b>
                </div>
                <div className={`countdown ${urgent ? "critical" : ""}`}>
                  <small>{due >= 0 ? "GATE NEEDED IN" : "WAITING FOR"}</small>
                  <strong>{countdown(due)}</strong>
                  <span>{due < 0 ? "Aircraft holding" : urgent ? "Critical" : "Assignment window"}</span>
                </div>
                <button className="action-button primary" onClick={() => openAssign(f.id)}>
                  Assign Gate
                </button>
              </article>
            );
          })}
        {!flights.length && (
          <div className="all-clear">
            <span>ALL CLEAR</span>
            <h2>All flights have gate assignments</h2>
            <p>There are no outstanding assignments at this time.</p>
          </div>
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------- Planes page */

function PlanesPage({ tick, minute }: { tick: Tick | null; minute: number }) {
  const [query, setQuery] = useState("");
  const all = tick ? Object.values(tick.flights) : [];
  const aircraft = all
    .filter((f) => !f.cancelled)
    .map((f) => ({ f, window: f.intervals.find((w) => w[0] <= minute && minute < w[1]) }))
    .filter((x) => x.window)
    .filter(({ f }) => `${f.code} ${f.route} ${f.aircraftName} ${f.gate}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <section className="page-head">
        <div>
          <span className="kicker">AIRFIELD INVENTORY</span>
          <h1>Planes Currently at Pearson</h1>
          <p>Aircraft occupying a gate or holding for one at {clockLabel(minute)}</p>
        </div>
        <div className="aircraft-total">
          <b>{aircraft.length}</b>
          <span>AIRCRAFT ON FIELD</span>
        </div>
      </section>
      <div className="planes-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Search flight, route, type or gate" />
      </div>
      <div className="planes-table">
        <div className="planes-table-head">
          <span>FLIGHT / ROUTE</span>
          <span>TYPE</span>
          <span>LOCATION</span>
          <span>GATE WINDOW</span>
          <span>STATUS</span>
        </div>
        {aircraft.map(({ f, window }) => {
          const [state, tone] = f.strandedAt
            ? [f.strandedAt.reason === "outage" ? "Needs new gate · outage" : f.strandedAt.reason === "incompatible" ? "Needs new gate · doesn't fit" : "Needs new gate", "alert"]
            : f.diversion
            ? [`Emergency · ${f.reason}`, "alert"]
            : !f.gate
              ? ["Awaiting gate", "alert"]
              : f.delayMin > 0
                ? [`Delayed +${f.delayMin} min`, "locked"]
                : ["At gate", "normal"];
          return (
            <article className="plane-row" key={f.id}>
              <div className="plane-identity">
                <span className="plane-badge small">
                  <Icon name="plane" />
                </span>
                <span>
                  <b>{f.code}</b>
                  <small>{f.route}</small>
                </span>
              </div>
              <span className="plane-type">
                {f.aircraftName}
                <small>{f.categoryName}</small>
              </span>
              <strong className="plane-location">
                {f.gate ? `Gate ${f.gate}` : f.strandedAt ? `Gate ${f.strandedAt.gate} · must vacate` : "Holding — no gate"}
              </strong>
              <span className="plane-window">{windowLabel(window)}</span>
              <span className={`plane-state ${tone}`}>
                {state}
              </span>
            </article>
          );
        })}
        {!aircraft.length && (
          <div className="empty-state">
            <Icon name="search" size={28} />
            <h3>No aircraft on field</h3>
            <p>{query ? "Try a flight code, route, aircraft type or gate." : "Move the simulation clock to a busier time."}</p>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------- Update modal */

function UpdateModal({
  sim,
  tick,
  flight,
  mode,
  minute,
  readOnly,
  close,
  save,
  unassign,
}: {
  sim: SimResult;
  tick: Tick;
  flight: FlightView;
  mode: "current" | "incoming" | "assign";
  minute: number;
  readOnly: boolean;
  close: () => void;
  save: (gate: string | null, delta: number) => void;
  unassign: () => void;
}) {
  const originalStart = flight.intervals[0]?.[0] ?? minute;
  const [selectedGate, setSelectedGate] = useState("");
  const [time, setTime] = useState(clockLabel(originalStart));
  const [h, m] = time.split(":").map(Number);
  const newStartTod = Number.isFinite(h) ? h * 60 + m : originalStart % 1440;
  const delta = newStartTod - (originalStart % 1440);
  const shifted: Interval[] = flight.intervals.map((w) => [w[0] + delta, w[1] + delta]);
  const completed = readOnly || flight.intervals.every((w) => w[1] <= minute);
  const started = flight.intervals.some((w) => w[0] <= minute);
  const options = gateOptions(sim, tick, flight, shifted);
  const ranked = options.filter((o) => !o.blocker).sort((a, b) => a.cost - b.cost).slice(0, 3);
  const blocker = selectedGate ? gateBlocker(sim, tick, flight, selectedGate, shifted) : null;
  const stayBlocker = !selectedGate && delta && flight.gate ? gateBlocker(sim, tick, flight, flight.gate, shifted) : null;
  const gate = sim.gates.find((g) => g.id === flight.gate);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const kicker = mode === "assign" ? "GATE ASSIGNMENT" : mode === "incoming" ? "INCOMING MANUAL UPDATE" : "CURRENT MANUAL UPDATE";
  const title = mode === "assign" ? `Assign ${flight.code}` : `Update ${flight.code}${flight.gate ? ` at ${flight.gate}` : ""}`;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div>
            <span className="kicker">{kicker}</span>
            <h2 id="modal-title">{title}</h2>
            <p>{flight.route} · Any other flights affected are re-planned automatically.</p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-content">
          <div className="modal-column current-column">
            <h3>Current</h3>
            <span className="read-only">READ ONLY</span>
            <div className="modal-section">
              <span className="eyebrow">{flight.diversion ? `EMERGENCY · ${flight.reason?.toUpperCase()}` : "FLIGHT"}</span>
              <div className="modal-flight">
                <span className="plane-badge small">
                  <Icon name="plane" />
                </span>
                <div>
                  <b>{flight.code}</b>
                  <small>
                    {flight.aircraftName} · {flight.categoryName}
                  </small>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Gate</dt>
                  <dd>{flight.gate ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Gate window</dt>
                  <dd>{flight.intervals.map(fmtInterval).join(", ")}</dd>
                </div>
                <div>
                  <dt>Needs</dt>
                  <dd>
                    {flight.wingspan}m wingspan{flight.jetbridge ? " · jetbridge" : ""}
                    {flight.category === 2 ? " · customs" : flight.category === 0 ? " · cargo gate" : ""}
                  </dd>
                </div>
                {flight.delayMin !== 0 && (
                  <div>
                    <dt>Filed window</dt>
                    <dd>{flight.filedIntervals.map(fmtInterval).join(", ")}</dd>
                  </div>
                )}
              </dl>
            </div>
            {gate && (
              <div className="modal-section">
                <span className="eyebrow">ASSIGNED GATE</span>
                <dl>
                  <div>
                    <dt>Type</dt>
                    <dd>{gate.typeName}</dd>
                  </div>
                  <div>
                    <dt>Max wingspan</dt>
                    <dd>{gate.max_wingspan}m</dd>
                  </div>
                  <div>
                    <dt>Jetbridge</dt>
                    <dd>{gate.jetbridge ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Walking distance</dt>
                    <dd>{gate.dist > 0 ? `${gate.dist}m` : "Remote stand"}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
          <div className="change-arrow">
            <Icon name="arrow" size={26} />
          </div>
          <div className={`modal-column updated-column ${completed ? "locked-update" : ""}`}>
            <h3>Updated</h3>
            <span className={completed ? "read-only" : "editable"}>{completed ? "LOCKED" : "EDITABLE"}</span>
            {completed && (
              <div className="locked-modal-notice">
                <Icon name="lock" />
                <span>
                  <b>{readOnly ? "Historical record" : "Completed flight"}</b>
                  <small>{readOnly ? "Past operating days are read only." : "This gate window has ended — the record is read only."}</small>
                </span>
              </div>
            )}
            <div className="suggestions">
              <span>
                <b>Suggested gates</b>
                <small>Best operational fit</small>
              </span>
              <div>
                {ranked.map(({ gate: g }, i) => (
                  <button className={selectedGate === g.id ? "chosen" : ""} onClick={() => setSelectedGate(g.id)} key={g.id} disabled={completed}>
                    <b>
                      <i>{i + 1}</i>
                      {g.id}
                    </b>
                    <small>{suggestionReason(g, flight)}</small>
                  </button>
                ))}
                {!ranked.length && <p className="no-suggestions">No compatible gate is free for this window.</p>}
              </div>
            </div>
            <label className="field">
              <span>New gate</span>
              <div>
                <select value={selectedGate} disabled={completed} onChange={(e) => setSelectedGate(e.target.value)}>
                  <option value="">{flight.gate ? `Keep ${flight.gate}` : "Select an available gate"}</option>
                  {options.map(({ gate: g, blocker: b }) => (
                    <option key={g.id} value={g.id} disabled={!!b}>
                      {g.id} — {b ?? `Available · ${g.typeName}`}
                    </option>
                  ))}
                </select>
                <button type="button" title="Keep current gate" disabled={completed} onClick={() => setSelectedGate("")}>
                  <Icon name="back" />
                </button>
              </div>
            </label>
            <div className="field-row">
              <label className="field">
                <span>Gate window start</span>
                <div>
                  <input type="time" value={time} disabled={completed || started} onChange={(e) => setTime(e.target.value)} />
                  <button type="button" title="Restore original time" disabled={completed || started} onClick={() => setTime(clockLabel(originalStart))}>
                    <Icon name="back" />
                  </button>
                </div>
              </label>
              <label className="field">
                <span>New window</span>
                <div>
                  <input readOnly value={shifted.map(fmtInterval).join(", ")} />
                </div>
              </label>
            </div>
            <div className={`availability-note ${blocker || stayBlocker ? "warn" : ""}`}>
              <span>
                <b>Live availability check</b>
                <small>
                  {blocker
                    ? `${selectedGate}: ${blocker}`
                    : stayBlocker
                      ? `${flight.gate} no longer fits (${stayBlocker}) — it will be re-planned automatically.`
                      : selectedGate
                        ? `${selectedGate} is compatible and free for ${shifted.map(fmtInterval).join(", ")}.`
                        : started
                          ? "Aircraft already on stand — timing is fixed; choose a gate to move it."
                          : "Choose a gate or adjust the time to validate."}
                </small>
              </span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <span>{completed ? "Completed flights cannot be edited." : "Changes are logged to the operations record."}</span>
          <div>
            {!completed && flight.gate && (
              <button className="danger-button" onClick={unassign} title={`Take ${flight.code} off gate ${flight.gate}; it moves to Unassigned Flights`}>
                Unassign from {flight.gate}
              </button>
            )}
            <button className="secondary-button" onClick={close}>
              {completed ? "Close" : "Cancel"}
            </button>
            {!completed && (
              <button className="save-button" disabled={(!selectedGate && !delta) || !!blocker} onClick={() => save(selectedGate || null, delta)}>
                {selectedGate ? "Save Assignment" : "Save Update"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------- Outage reassignment pop-up */

const OUTAGE_MINUTES = 120;

function OutageModal({
  sim,
  tick,
  minute,
  prompt,
  close,
  confirm,
}: {
  sim: SimResult;
  tick: Tick;
  minute: number;
  prompt: { gate: string; window: Interval; flights: FlightView[] };
  close: () => void;
  confirm: (moves: { flight: FlightView; gate: string }[]) => void;
}) {
  // For each affected flight, the best free gate by the algorithm's cost, avoiding the
  // closing gate and not double-booking gates suggested to earlier flights in this list.
  const { suggested, options } = useMemo(() => {
    const taken: { gate: string; intervals: Interval[] }[] = [];
    const suggested: Record<string, string> = {};
    const options: Record<string, ReturnType<typeof gateOptions>> = {};
    for (const f of prompt.flights) {
      const opts = gateOptions(sim, tick, f).filter((o) => o.gate.id !== prompt.gate);
      options[f.id] = opts;
      const clash = (gid: string) => taken.some((t) => t.gate === gid && t.intervals.some((x) => f.intervals.some((y) => x[0] < y[1] && y[0] < x[1])));
      const best = opts.filter((o) => !o.blocker && !clash(o.gate.id)).sort((a, b) => a.cost - b.cost)[0];
      if (best) {
        suggested[f.id] = best.gate.id;
        taken.push({ gate: best.gate.id, intervals: f.intervals });
      }
    }
    return { suggested, options };
  }, [sim, tick, prompt]);
  const [choice, setChoice] = useState<Record<string, string>>(suggested);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const moves = prompt.flights.filter((f) => choice[f.id]).map((f) => ({ flight: f, gate: choice[f.id] }));
  const left = prompt.flights.length - moves.length;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="outage-title">
        <div className="modal-head">
          <div>
            <span className="kicker alert-kicker">GATE OUTAGE</span>
            <h2 id="outage-title">Take {prompt.gate} out of service?</h2>
            <p>
              {fmtInterval(prompt.window)} · {prompt.flights.length} flight{prompt.flights.length > 1 ? "s are" : " is"} at or due at {prompt.gate}{" "}
              during the outage. Reassign {prompt.flights.length > 1 ? "them" : "it"} now.
            </p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="fill-list">
          {prompt.flights.map((f) => {
            const onStand = f.intervals.some((w) => w[0] <= minute && minute < w[1]);
            const opts = options[f.id] ?? [];
            return (
              <div className="outage-row" key={f.id}>
                <span className="plane-badge small">
                  <Icon name="plane" />
                </span>
                <span className="fill-id">
                  <b>{f.code}</b>
                  <small>{f.route}</small>
                </span>
                <span className="fill-meta">
                  {f.intervals.map(fmtInterval).join(", ")}
                  <small>{onStand ? "On stand now" : "Scheduled in"}</small>
                </span>
                <label className="field outage-field">
                  <span>Reassign to</span>
                  <div>
                    <select value={choice[f.id] ?? ""} onChange={(e) => setChoice({ ...choice, [f.id]: e.target.value })}>
                      <option value="">Leave unassigned</option>
                      {opts.map(({ gate: g, blocker }) => (
                        <option key={g.id} value={g.id} disabled={!!blocker}>
                          {g.id} — {blocker ?? (suggested[f.id] === g.id ? "Suggested · best fit" : `Available · ${g.typeName}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <span className={`fill-fit ${choice[f.id] ? "yes" : "no"}`}>
                  {choice[f.id] ? (choice[f.id] === suggested[f.id] ? "Suggested gate" : "Manual choice") : suggested[f.id] ? "Will be unassigned" : "No gate free"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <span>{left ? `${left} flight${left > 1 ? "s" : ""} will go to Unassigned Flights.` : "All affected flights will be reassigned."}</span>
          <div>
            <button className="secondary-button" onClick={close}>
              Cancel
            </button>
            <button className="danger-button outage-confirm" onClick={() => confirm(moves)}>
              {moves.length ? `Reassign ${moves.length} & take ${prompt.gate} out of service` : `Take ${prompt.gate} out of service`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- Fill an empty gate */

function FillGateModal({
  sim,
  tick,
  minute,
  gateId,
  slot,
  close,
  assign,
}: {
  sim: SimResult;
  tick: Tick;
  minute: number;
  gateId: string;
  slot: "current" | "incoming";
  close: () => void;
  assign: (flight: FlightView, gate: string) => void;
}) {
  const [picked, setPicked] = useState("");
  const g = sim.gates.find((x) => x.id === gateId)!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Current slot: aircraft on the field now. Incoming slot: flights still to arrive.
  const candidates = Object.values(tick.flights)
    .filter((f) => !f.cancelled && f.intervals.length && f.gate !== gateId)
    .filter((f) =>
      slot === "current" ? f.intervals.some((w) => w[0] <= minute && minute < w[1]) : f.intervals.some((w) => w[0] > minute),
    )
    .map((f) => ({ f, why: gateBlocker(sim, tick, f, gateId) }))
    .sort((a, b) => Number(!!a.why) - Number(!!b.why) || a.f.intervals[0][0] - b.f.intervals[0][0]);
  const chosen = candidates.find((c) => c.f.id === picked);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="fill-title">
        <div className="modal-head">
          <div>
            <span className="kicker">{slot === "current" ? "CURRENT MANUAL UPDATE" : "INCOMING MANUAL UPDATE"}</span>
            <h2 id="fill-title">Assign a flight to {gateId}</h2>
            <p>
              {g.typeName} gate · max wingspan {g.max_wingspan}m · {g.jetbridge ? "jetbridge" : "stairs"} ·{" "}
              {slot === "current" ? "aircraft on the field now" : "flights still to arrive"}
            </p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="fill-list">
          {candidates.map(({ f, why }) => (
            <button
              key={f.id}
              className={`fill-row ${picked === f.id ? "chosen" : ""}`}
              disabled={!!why}
              onClick={() => setPicked(f.id)}
            >
              <span className="plane-badge small">
                <Icon name="plane" />
              </span>
              <span className="fill-id">
                <b>{f.code}</b>
                <small>{f.route}</small>
              </span>
              <span className="fill-meta">
                {f.aircraftName}
                <small>{f.categoryName}</small>
              </span>
              <span className="fill-meta">
                {f.intervals.map(fmtInterval).join(", ")}
                <small>{f.gate ? `Now at ${f.gate}` : "Unassigned"}</small>
              </span>
              <span className={`fill-fit ${why ? "no" : "yes"}`}>{why ?? "Fits"}</span>
            </button>
          ))}
          {!candidates.length && (
            <div className="empty-state">
              <h3>No flights to place</h3>
              <p>{slot === "current" ? "No other aircraft are on the field right now." : "No other flights are still to arrive today."}</p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span>Any flights affected are re-planned automatically.</span>
          <div>
            <button className="secondary-button" onClick={close}>
              Cancel
            </button>
            <button className="save-button" disabled={!chosen || !!chosen.why} onClick={() => chosen && assign(chosen.f, gateId)}>
              {chosen ? `Assign ${chosen.f.code} to ${gateId}` : "Select a flight"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- App */

/** History days open at end of day, planned days at the first update, today at the busiest moment. */
function startMinute(s: ScenarioEntry) {
  const base = simulate(staticInfo, s.data);
  if (s.kind === "history") return Math.ceil(base.timeMax / 60) * 60;
  if (s.kind === "planned") return base.ticks[0]?.time ?? base.timeMin;
  return defaultMinute(base);
}

export default function App() {
  const [scenarioId, setScenarioIdRaw] = useState((scenarios.find((s) => s.kind === "today") ?? scenarios[0]).id);
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  const [injections, setInjections] = useState<Injection[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const sim = useMemo(() => simulate(staticInfo, withInjections(scenario.data, injections), pins), [scenario, injections, pins]);
  const range = useMemo<[number, number]>(() => {
    const base = simulate(staticInfo, scenario.data);
    const lo = Math.min(base.timeMin, base.ticks[0]?.time ?? base.timeMin);
    return [Math.floor(lo / 60) * 60 - 30, Math.ceil(base.timeMax / 60) * 60 + 30];
  }, [scenario]);
  const [minute, setMinute] = useState(() => startMinute(scenario));
  const [playing, setPlaying] = useState(false);
  const [page, setPageRaw] = useState<Page>("current");
  const [gateDetail, setGateDetail] = useState<string | null>(null);
  const [mapView, setMapView] = useState(false);
  const returnScroll = useRef(0);

  // Gate pages get a browser-history entry, so Back (button, Esc or the browser) returns to the map/list.
  const openGate = (id: string) => {
    returnScroll.current = window.scrollY;
    setGateDetail(id);
    window.history.pushState({ gate: id }, "");
    window.scrollTo(0, 0);
  };
  const closeGate = useCallback(() => {
    setGateDetail(null);
    requestAnimationFrame(() => window.scrollTo(0, returnScroll.current));
  }, []);
  // The on-page Back button / Esc close the gate page directly (relying on history.back() could
  // land on a stale entry and do nothing); the browser's own Back still works via popstate.
  const goBackFromGate = useCallback(() => {
    closeGate();
    // Also pop our history entry so the browser's Back doesn't have to step through it later.
    if (window.history.state?.gate) window.history.back();
  }, [closeGate]);
  useEffect(() => {
    const onPop = () => closeGate();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [closeGate]);
  const setPage = (p: Page) => {
    setPageRaw(p);
    setGateDetail(null);
  };
  const [modal, setModal] = useState<ModalState>(null);
  const [outagePrompt, setOutagePrompt] = useState<{ gate: string; window: Interval; flights: FlightView[] } | null>(null);
  const [fill, setFill] = useState<{ gate: string; slot: "current" | "incoming" } | null>(null);
  useEffect(() => {
    if (!gateDetail || modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && goBackFromGate();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gateDetail, modal, goBackFromGate]);
  const [toast, setToast] = useState<{ text: string; warn?: boolean } | null>(null);

  const setScenarioId = (id: string) => {
    const s = scenarios.find((x) => x.id === id)!;
    setScenarioIdRaw(id);
    setInjections([]);
    setPins([]);
    setPlaying(false);
    setMinute(startMinute(s));
    setGateDetail(null);
  };
  const readOnly = scenario.kind === "history";

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setMinute((m) => {
        if (m + 1 > range[1]) {
          setPlaying(false);
          return m;
        }
        return m + 1;
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, [playing, range]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const tick = tickAt(sim, minute);
  const rows = gateRows(sim, tick, minute);
  const unassigned = unassignedFlights(tick);
  const planes = planePositions(tick, minute);
  const closeModal = useCallback(() => setModal(null), []);

  const describeReplan = (next: SimResult, at: number, flightId?: string) => {
    const t = next.ticks.find((x) => x.time === at);
    const rejected = t?.log.find((l) => l.startsWith("[MANUAL REJECTED]") && (!flightId || l.includes(flightId)));
    if (rejected) return { text: plainIds(rejected.replace("[MANUAL REJECTED] ", "Rejected: ")), warn: true };
    const displaced = (t?.log ?? []).filter((l) => l.startsWith("[DISPLACED]")).map((l) => plainIds(l).match(/\] (.+?) removed/)?.[1]).filter(Boolean);
    const conflict = t?.log.find((l) => l.startsWith("[HARD FAILURE]"));
    if (conflict) return { text: `Unresolved conflict: ${conflictText(conflict.replace("[HARD FAILURE] ", ""))}`, warn: true };
    // Only report moves this change caused, not ones already in the plan at this minute.
    const key = (mv: { flight: string; from: string; to: string }) => `${mv.flight}|${mv.from}|${mv.to}`;
    const already = new Set((sim.ticks.find((x) => x.time === at)?.moves ?? []).map(key));
    const moved = t?.moves.filter((mv) => mv.cause !== "manual" && !already.has(key(mv))) ?? [];
    // Only count flights this change newly left without a gate.
    const before = new Set(unassignedFlights(sim.ticks.filter((x) => x.time <= at).at(-1) ?? null).map((f) => f.id));
    const lost = unassignedFlights(t ?? null).filter((f) => !before.has(f.id) && !f.held).length;
    const parts = [];
    if (moved.length) parts.push(`auto re-plan moved ${moved.map((mv) => `${t!.flights[mv.flight].code} ${mv.from}→${mv.to}`).join(", ")}`);
    if (displaced.length) parts.push(`${displaced.join(", ")} moved to Unassigned (no compatible gate free)`);
    else if (lost) parts.push(`${lost} flight(s) now unassigned`);
    return { text: parts.join(" · "), warn: lost > 0 };
  };

  const saveUpdate = (flight: FlightView, gate: string | null, delta: number) => {
    const nextInj = delta ? [...injections, { time: minute, msg: retimeMessage(flight, delta), label: `Retime ${flight.code}` }] : injections;
    const nextPins = gate ? [...pins, { time: minute, flight: flight.id, gate }] : pins;
    const next = simulate(staticInfo, withInjections(scenario.data, nextInj), nextPins);
    const r = describeReplan(next, minute, flight.id);
    setInjections(nextInj);
    setPins(nextPins);
    const what = [gate && `${flight.code} → gate ${gate}`, delta && `${flight.code} retimed ${delta > 0 ? "+" : ""}${delta} min`].filter(Boolean).join(" · ");
    setToast(r.warn ? r : { text: [what, r.text].filter(Boolean).join(" · ") });
    setModal(null);
  };

  const unassignFlight = (flight: FlightView) => {
    setPins([...pins, { time: minute, flight: flight.id, gate: null }]);
    setToast({ text: `${flight.code} removed from gate ${flight.gate} · now in Unassigned Flights` });
    setModal(null);
  };

  const assignToGate = (flight: FlightView, gate: string) => {
    const nextPins = [...pins, { time: minute, flight: flight.id, gate }];
    const next = simulate(staticInfo, withInjections(scenario.data, injections), nextPins);
    const r = describeReplan(next, minute, flight.id);
    setPins(nextPins);
    setToast(r.warn ? r : { text: [`${flight.code} → gate ${gate}`, r.text].filter(Boolean).join(" · ") });
    setFill(null);
  };

  const restoreGate = (gate: string) => {
    const nextInj = [...injections, { time: minute, msg: restoreMessage(gate), label: `Restore ${gate}` }];
    setInjections(nextInj);
    setToast({ text: `Gate ${gate} back in service at ${clockLabel(minute)}` });
  };

  /** Apply an outage, plus any reassignments the controller chose in the outage pop-up. */
  const applyOutage = (gate: string, moves: { flight: FlightView; gate: string }[]) => {
    const msg = outageMessage(gate, minute, minute + OUTAGE_MINUTES);
    const nextInj = [...injections, { time: minute, msg, label: `Outage ${gate}` }];
    const nextPins = [...pins, ...moves.map((m) => ({ time: minute, flight: m.flight.id, gate: m.gate }))];
    const next = simulate(staticInfo, withInjections(scenario.data, nextInj), nextPins);
    const r = describeReplan(next, minute);
    setInjections(nextInj);
    setPins(nextPins);
    setOutagePrompt(null);
    const moved = moves.map((m) => `${m.flight.code} → ${m.gate}`).join(", ");
    setToast({
      text: [`Gate ${gate} out of service ${clockLabel(minute)}–${clockLabel(minute + OUTAGE_MINUTES)}`, moved, r.text].filter(Boolean).join(" · "),
      warn: r.warn,
    });
  };

  /** Mark out of service: if planes are at or due at the gate during the outage, ask first. */
  const markOutage = (gate: string) => {
    if (!tick) return;
    const window: Interval = [minute, minute + OUTAGE_MINUTES];
    const affected = (tick.plan[gate] ?? [])
      .map((id) => tick.flights[id])
      .filter((f) => f.intervals.some((w) => w[0] < window[1] && window[0] < w[1] && w[1] > minute))
      .sort((a, b) => a.intervals[0][0] - b.intervals[0][0]);
    if (!affected.length) applyOutage(gate, []);
    else setOutagePrompt({ gate, window, flights: affected });
  };

  const modalFlight = modal && tick ? tick.flights[modal.flightId] : undefined;

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} count={unassigned.length} sim={sim} />
      <main className="main">
        <div className="sticky-head">
          <SimBar
            sim={sim}
            minute={minute}
            setMinute={setMinute}
            range={range}
            playing={playing}
            setPlaying={setPlaying}
            changes={injections.length + pins.length}
            reset={() => {
              setInjections([]);
              setPins([]);
            }}
          />
          <AppHeader minute={minute} scenario={scenario} setScenarioId={setScenarioId} />
        </div>
        <div className="content">
          {sim.status === "FAILED" && (
            <div className="failure-banner">
              <Icon name="alert" />
              <span>
                <b>Unresolved gate conflict{sim.failures.length > 1 ? `s (${sim.failures.length})` : ""}:</b>{" "}
                {sim.failure && `${sim.failure.split(" — ")[0]} — ${conflictText(sim.failure.split(" — ").slice(1).join(" — "))}`}
                {sim.failures.length > 1 && ` (+${sim.failures.length - 1} more in the operations log)`}
              </span>
            </div>
          )}
          {page === "current" && (
            gateDetail ? (
              <GateDetailPage
                sim={sim}
                tick={tick}
                minute={minute}
                row={rows.find((r) => r.gate.id === gateDetail)!}
                readOnly={readOnly}
                back={goBackFromGate}
                backLabel={mapView ? "Back to map" : "Back to gate list"}
                openFlight={(id, mode) => setModal({ flightId: id, mode })}
                fillGate={(gate, slot) => setFill({ gate, slot })}
                markOutage={markOutage}
                restoreGate={restoreGate}
              />
            ) : (
              <CurrentPage
                rows={rows}
                scenario={scenario}
                readOnly={readOnly}
                mapView={mapView}
                setMapView={setMapView}
                openFlight={(id, mode) => setModal({ flightId: id, mode })}
                fillGate={(gate, slot) => setFill({ gate, slot })}
                markOutage={markOutage}
                restoreGate={restoreGate}
                openGate={openGate}
                planes={planes}
              />
            )
          )}
          {page === "schedule" && <SchedulePage sim={sim} tick={tick} minute={minute} kind={scenario.kind} openFlight={(id) => setModal({ flightId: id, mode: "current" })} />}
          {page === "unassigned" && <UnassignedPage sim={sim} tick={tick} minute={minute} openAssign={(id) => setModal({ flightId: id, mode: "assign" })} />}
          {page === "planes" && <PlanesPage tick={tick} minute={minute} />}
        </div>
      </main>
      {outagePrompt && tick && (
        <OutageModal
          sim={sim}
          tick={tick}
          minute={minute}
          prompt={outagePrompt}
          close={() => setOutagePrompt(null)}
          confirm={(moves) => applyOutage(outagePrompt.gate, moves)}
        />
      )}
      {fill && tick && (
        <FillGateModal
          sim={sim}
          tick={tick}
          minute={minute}
          gateId={fill.gate}
          slot={fill.slot}
          close={() => setFill(null)}
          assign={assignToGate}
        />
      )}
      {modal && modalFlight && tick && (
        <UpdateModal
          key={modal.flightId}
          sim={sim}
          tick={tick}
          flight={modalFlight}
          mode={modal.mode}
          minute={minute}
          readOnly={readOnly}
          close={closeModal}
          save={(gate, delta) => saveUpdate(modalFlight, gate, delta)}
          unassign={() => unassignFlight(modalFlight)}
        />
      )}
      {toast && (
        <div className={`toast ${toast.warn ? "warn" : ""}`} role="status">
          <span>{toast.warn ? "!" : "✓"}</span>
          {toast.text}
        </div>
      )}
    </div>
  );
}
