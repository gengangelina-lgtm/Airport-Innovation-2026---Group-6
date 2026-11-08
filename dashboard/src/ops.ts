/** Derives the dashboard's view of the airport from a simulation snapshot. */
import { CARGO, fmt, fmtInterval, hhmmToMin, incompatibility, overlap } from "./engine/model.ts";
import type { Interval, Message, Scenario } from "./engine/model.ts";
import { gateCost } from "./engine/solver.ts";
import type { FlightView, GateMeta, SimResult, Tick } from "./engine/simulate.ts";

export type GateStatus = "normal" | "alert" | "outage";

export type GateRow = {
  gate: GateMeta;
  status: GateStatus;
  current?: { flight: FlightView; window: Interval };
  incoming?: { flight: FlightView; window: Interval };
  outage?: Interval;
  upcomingOutage?: Interval;
  movedFrom?: { gate: string; cause: string };
  /** A plane still parked here that can't use the gate (outage / no longer fits). */
  stranded?: "outage" | "incompatible" | "conflict";
  pulse: boolean;
};

export const CAUSE_LABEL: Record<string, string> = {
  info: "Schedule change",
  outage: "Gate outage",
  solver: "Automatic re-plan",
  manual: "Manual operator change",
};

const contains = (iv: Interval, m: number) => iv[0] <= m && m < iv[1];

export function gateRows(sim: SimResult, tick: Tick | null, minute: number): GateRow[] {
  return sim.gates.map((gate) => {
    const row: GateRow = { gate, status: "normal", pulse: false };
    if (!tick) return row;
    const ids = tick.plan[gate.id] ?? [];
    const windows = ids.flatMap((id) => tick.flights[id].intervals.map((w) => ({ flight: tick.flights[id], window: w })));
    row.current = windows.find((w) => contains(w.window, minute));
    if (!row.current) {
      const parked = Object.values(tick.flights).find(
        (f) => f.strandedAt?.gate === gate.id && !f.cancelled && f.intervals.some((w) => contains(w, minute)),
      );
      if (parked) {
        row.current = { flight: parked, window: parked.intervals.find((w) => contains(w, minute))! };
        row.stranded = parked.strandedAt!.reason;
      }
    }
    row.incoming = windows.filter((w) => w.window[0] > minute).sort((a, b) => a.window[0] - b.window[0])[0];
    const outs = tick.outages[gate.id] ?? [];
    row.outage = outs.find((w) => contains(w, minute));
    row.upcomingOutage = outs.filter((w) => w[0] > minute).sort((a, b) => a[0] - b[0])[0];

    const visible = [row.current?.flight, row.incoming?.flight].filter(Boolean) as FlightView[];
    const move = [...allMoves(sim, tick)].reverse().find((m) => m.to === gate.id && visible.some((f) => f.id === m.flight));
    if (move) row.movedFrom = { gate: move.from, cause: CAUSE_LABEL[move.cause] };

    if (row.outage) row.status = "outage";
    // A reassigned flight is normal operations: it gets a note, not alert styling.
    else if (visible.some((f) => f.diversion) || row.stranded) row.status = "alert";
    row.pulse = visible.some((f) => f.diversion) || !!row.stranded;
    return row;
  });
}

export function allMoves(sim: SimResult, tick: Tick) {
  return sim.ticks.filter((t) => t.time <= tick.time).flatMap((t) => t.moves);
}

/** Flights at YYZ with no gate (waiting for assignment). */
export function unassignedFlights(tick: Tick | null) {
  if (!tick) return [];
  return Object.values(tick.flights)
    .filter((f) => !f.cancelled && !f.gate && f.intervals.length)
    .sort((a, b) => a.intervals[0][0] - b.intervals[0][0]);
}

/** Why a flight can't use a gate right now, or null if it can. */
export function gateBlocker(sim: SimResult, tick: Tick, flight: FlightView, gateId: string, intervals = flight.intervals): string | null {
  const g = sim.gates.find((x) => x.id === gateId)!;
  const bad = incompatibility({ ...flight, jetbridge_required: flight.jetbridge }, g);
  if (bad) return bad;
  for (const id of tick.plan[gateId] ?? []) {
    if (id === flight.id) continue;
    const other = tick.flights[id];
    if (other.intervals.some((x) => intervals.some((y) => overlap(x, y)))) return `Occupied by ${other.code}`;
  }
  for (const w of tick.outages[gateId] ?? []) if (intervals.some((x) => overlap(x, w))) return "Gate outage";
  return null;
}

export function gateOptions(sim: SimResult, tick: Tick, flight: FlightView, intervals = flight.intervals) {
  return sim.gates
    .filter((g) => g.id !== flight.gate)
    .map((g) => {
      const blocker = gateBlocker(sim, tick, flight, g.id, intervals);
      const cost = gateCost({ ...flight, jetbridge_required: flight.jetbridge, intervals }, g);
      return { gate: g, blocker, cost };
    });
}

export function suggestionReason(g: GateMeta, f: FlightView) {
  const parts = [g.dist > 0 ? `${g.dist}m walk` : "Apron stand"];
  const slack = g.max_wingspan - f.wingspan;
  parts.push(slack <= 5 ? "tight wingspan fit" : `+${slack}m wingspan`);
  if (f.category !== CARGO && g.gate_type === 2 && f.category === 1) parts.push("customs gate");
  return parts.join(" · ");
}

export function whyUnassigned(sim: SimResult, tick: Tick, f: FlightView) {
  if (f.held) return "Unassigned by operator";
  const stuck = f.strandedAt
    ? `Gate ${f.strandedAt.gate} ${f.strandedAt.reason === "outage" ? "out of service" : f.strandedAt.reason === "incompatible" ? "no longer fits this aircraft" : "needed by another flight"} · `
    : "";
  const results = sim.gates.map((g) => ({ g, why: gateBlocker(sim, tick, f, g.id) }));
  const compatible = results.filter((r) => !incompatibility({ ...f, jetbridge_required: f.jetbridge }, r.g));
  if (!compatible.length) {
    const needs = [`${f.wingspan}m+ wingspan`];
    if (f.jetbridge) needs.push("jetbridge");
    if (f.category === CARGO) needs.push("cargo");
    if (f.category === 2) needs.push("customs");
    return `${stuck}No compatible gate (needs ${needs.join(", ")})`;
  }
  const free = compatible.filter((r) => !r.why);
  if (free.length) return `${stuck}Compatible gate free: ${free.map((r) => r.g.id).join(", ")}`;
  return `${stuck}All ${compatible.length} compatible gates occupied or out of service`;
}

export const windowLabel = (w?: Interval) => (w ? fmtInterval(w) : "—");

export function delayLabel(f: FlightView) {
  if (!f.delayMin) return null;
  const filed = f.filedIntervals[0]?.[0];
  const now = f.intervals[0]?.[0];
  return `Filed ${fmt(filed)} · Now ${fmt(now)} · ${f.delayMin > 0 ? "+" : ""}${f.delayMin} min`;
}

/* --------------------------------------------- operator-injected messages */

export type Injection = { time: number; msg: Message; label: string };

export const minuteKey = (m: number) => String(Math.floor(m / 60) * 100 + (m % 60)).padStart(4, "0");

export function withInjections(base: Scenario, inj: Injection[]): Scenario {
  const out: Scenario = {};
  for (const [k, v] of Object.entries(base)) out[k] = [...v];
  for (const i of inj) (out[minuteKey(i.time)] ??= []).push(i.msg);
  return out;
}

const hhmm = (m: number) => fmt(((m % 1440) + 1440) % 1440);

/** UpdateTiming that shifts every leg of a flight by `delta` minutes. */
export function retimeMessage(f: FlightView, delta: number): Message {
  return {
    action: "UpdateTiming",
    flight: f.meta,
    legs: f.legs.map((l) => ({
      ...l,
      scheduledDepartureTime: hhmm(hhmmToMin(l.scheduledDepartureTime) + delta),
      scheduledArrivalTime: hhmm(hhmmToMin(l.scheduledArrivalTime) + delta),
    })),
  };
}

export function restoreMessage(gate: string): Message {
  return { action: "GateRestore", gate };
}

export function outageMessage(gate: string, start: number, end: number | null): Message {
  return { action: "GateOutage", gate, scheduledStartTime: hhmm(start), scheduledEndTime: end == null ? null : hhmm(end) };
}

/** A good default "now": the busiest moment after the last planning update. */
export function defaultMinute(sim: SimResult) {
  const last = sim.ticks.at(-1);
  if (!last) return sim.timeMin;
  const flights = Object.values(last.flights).filter((f) => !f.cancelled);
  const starts = flights.flatMap((f) => f.intervals.map((w) => w[0])).filter((s) => s >= last.time);
  let best = Math.max(last.time, sim.timeMin);
  let bestCount = -1;
  for (const s of starts) {
    const c = flights.filter((f) => f.intervals.some((w) => contains(w, s + 1))).length;
    if (c > bestCount) {
      bestCount = c;
      best = s;
    }
  }
  return best;
}

/* ------------------------------------------- plain-language event wording */

const FLIGHT_ID = /\b([A-Z0-9]{2,3})-(\w+?)-\d{4}-\d{2}-\d{2}\b/g;

/** Replace internal flight ids (AC-501-2025-06-15) with flight codes (AC 501). */
export const plainIds = (text: string) => text.replace(FLIGHT_ID, (_m, c, n) => `${c} ${n}`);

/** Turn an engine log line into a controller-friendly sentence. Returns null for noise. */
export function friendlyLog(line: string): { text: string; tone: string } | null {
  const tag = line.match(/^\[([A-Z ]+)\]\s*/)?.[1] ?? "";
  const body = plainIds(line.replace(/^\[[A-Z ]+\]\s*/, "")).replace(/\s{2,}/g, " ");
  let m: RegExpMatchArray | null;
  switch (tag) {
    case "SCHEDULE":
      return { text: `Daily schedule received · ${body.replace(" filed", "").replace("(s)", "s")}`, tone: "info" };
    case "ASSIGN":
      m = body.match(/^(.+?) -> (\S+) (.*)$/);
      return { text: m ? `${m[1]} assigned to gate ${m[2]} (${m[3]})` : body, tone: "info" };
    case "REASSIGN":
      m = body.match(/^(.+?): (\S+) -> (\S+) (.*)$/);
      return { text: m ? `${m[1]} moved from gate ${m[2]} to ${m[3]} (${m[4]})` : body, tone: "move" };
    case "RESTORE":
      return { text: body, tone: "info" };
    case "OUTAGE":
      return { text: body.replace("unavailable", "out of service"), tone: "alert" };
    case "DIVERT":
      m = body.match(/^Unscheduled (\w+) arrival: (.+)$/);
      return { text: m ? `Emergency diversion (${m[1]}): ${m[2]} inbound` : body, tone: "alert" };
    case "UPDATETIMING":
      return { text: `${body} retimed`, tone: "warn" };
    case "UPDATEEQUIPMENT":
      return { text: `${body} aircraft type changed`, tone: "warn" };
    case "CANCELFLIGHT":
      return { text: `${body} cancelled`, tone: "warn" };
    case "REINSTATEFLIGHT":
      return { text: `${body} reinstated`, tone: "info" };
    case "CANCEL":
      m = body.match(/^(.+?) released gate (\S+)$/);
      return { text: m ? `Gate ${m[2]} released (${m[1]} cancelled)` : body, tone: "warn" };
    case "UPDATE":
      m = body.match(/^(.+?) @ (\S+) now (.+?) \(still valid\)$/);
      return { text: m ? `${m[1]} stays at gate ${m[2]}, now ${m[3]}` : body, tone: "info" };
    case "MANUAL":
      m = body.match(/^Operator moved (.+?): (\S+) -> (\S+)$/);
      if (m) return { text: `Manual change: ${m[1]} moved from gate ${m[2]} to ${m[3]}`, tone: "move" };
      m = body.match(/^Operator assigned (.+?) -> (\S+)$/);
      return { text: m ? `Manual change: ${m[1]} assigned to gate ${m[3 - 1]}` : body, tone: "move" };
    case "UNASSIGN":
      m = body.match(/^Operator removed (.+?) from (\S+)$/);
      return { text: m ? `Manual change: ${m[1]} unassigned from gate ${m[2]}` : body, tone: "move" };
    case "MANUAL REJECTED":
      return { text: `Manual change rejected: ${body.replace(" -> ", " → ")}`, tone: "alert" };
    case "DISPLACED":
      m = body.match(/^(.+?) removed from (\S+): (.+?); no compatible gate free$/);
      return { text: m ? `${m[1]} moved to Unassigned — ${m[2]}: ${m[3]}, no compatible gate free` : body, tone: "alert" };
    case "HARD FAILURE":
      return { text: `Unresolved conflict: ${conflictText(body)}`, tone: "alert" };
    case "WARN":
      return null;
  }
  return { text: body, tone: "info" };
}

/** Readable wording for a gate conflict the auto re-plan couldn't fix. */
export function conflictText(msg: string) {
  const t = plainIds(msg);
  const m = t.match(/Flight (.+?) must move off gate (\S+): blocked by (an outage|flight (.+?))[ .[]/);
  if (m) return `${m[1]} is on gate ${m[2]} but the gate is ${m[4] ? `needed by ${m[4]}` : "out of service"}, and no compatible gate is free.`;
  const n = t.match(/Flight (.+?) info change makes gate (\S+) invalid \((.+)\)/);
  if (n) return `${n[1]} no longer fits gate ${n[2]} (${n[3].toLowerCase()}), and no compatible gate is free.`;
  return t;
}
