/**
 * Port of evaluator.py's run_sim: replays a scenario message-by-message,
 * asks the solver for decisions at each information time, enforces the hard
 * rules and accumulates the soft score. Each tick is recorded so the
 * dashboard can show the plan at any point in the day.
 */
import {
  CATEGORY_NAME,
  DOMESTIC,
  FlightStore,
  INTERNATIONAL,
  OUTAGE_OPEN_END,
  WEIGHTS,
  fmt,
  fmtInterval,
  flightProfile,
  incompatibility,
  keyToMin,
  overlap,
  parseGateOutage,
  setsConflict,
} from "./model.ts";
import type { FlightState, GateInfo, Interval, Leg, Profile, Scenario, StaticInfo } from "./model.ts";
import { decide } from "./solver.ts";
import type { Booking, SolverFlight } from "./solver.ts";

export type FlightView = {
  id: string;
  meta: { carrier: string; flightNumber: string; flightSuffix: string | null; originatingDate: string };
  legs: Leg[];
  code: string;
  route: string;
  aircraftType: string;
  aircraftName: string;
  category: number | null;
  categoryName: string;
  wingspan: number;
  jetbridge: boolean;
  intervals: Interval[];
  filedIntervals: Interval[];
  delayMin: number;
  equipmentChanged: string | null;
  diversion: boolean;
  reason: string | null;
  cancelled: boolean;
  gate: string | null;
  held: boolean;
  /** Still parked at this gate after being taken off it (outage / no longer fits). */
  strandedAt: { gate: string; reason: "outage" | "incompatible" | "conflict" } | null;
  lastAction: string;
  infoTime: number;
};

export type MoveEvent = { flight: string; from: string; to: string; time: number; cause: "info" | "outage" | "solver" | "manual" };

export type Tick = {
  time: number;
  log: string[];
  flights: Record<string, FlightView>;
  plan: Record<string, string[]>;
  outages: Record<string, Interval[]>;
  moves: MoveEvent[];
  decisions: { assignments: [string, string][]; reassignments: [string, string][] };
};

export type GateMeta = GateInfo & { id: string; typeName: string };

export type ScoreLine = { category: keyof typeof WEIGHTS; count: number; points: number };

export type SimResult = {
  gates: GateMeta[];
  ticks: Tick[];
  status: "OK" | "FAILED";
  failure: string | null;
  failures: string[];
  score: number | null;
  breakdown: ScoreLine[];
  assigned: number;
  unassigned: string[];
  timeMin: number;
  timeMax: number;
};

const GATE_TYPE_NAME = ["Cargo", "Domestic", "International"];

class HardFailure extends Error {}

const profileChanged = (a: Profile, b: Profile) =>
  JSON.stringify(a.intervals) !== JSON.stringify(b.intervals) ||
  a.category !== b.category ||
  a.wingspan !== b.wingspan ||
  a.jetbridge_required !== b.jetbridge_required;

const solverView = (p: Profile): SolverFlight => ({
  intervals: p.intervals,
  wingspan: p.wingspan,
  jetbridge_required: p.jetbridge_required,
  category: p.category,
  priority: p.diversion,
});

/**
 * An operator pin: force a flight onto a gate at a given minute, or
 * (gate = null) take it off its gate and hold it until the operator assigns it.
 */
export type Pin = { time: number; flight: string; gate: string | null };

export function simulate(info: StaticInfo, scenario: Scenario, pins: Pin[] = []): SimResult {
  const gates = info.gate_info;
  const store = new FlightStore();
  const gateAssignments: Record<string, Booking[]> = Object.fromEntries(Object.keys(gates).map((g) => [g, []]));
  const gateOutages: Record<string, Interval[]> = Object.fromEntries(Object.keys(gates).map((g) => [g, []]));
  const flightAssignments = new Map<string, { gate: string; snapshot: Profile }>();
  const moves: MoveEvent[] = [];
  /** Flights an operator unassigned; the solver leaves them alone until re-assigned. */
  const held = new Set<string>();
  /** Flights taken off a gate they can no longer use, while still physically parked there. */
  const stranded = new Map<string, { gate: string; reason: "outage" | "incompatible" | "conflict" }>();
  const ticks: Tick[] = [];
  const score = new Map<keyof typeof WEIGHTS, { count: number; points: number }>();
  const addScore = (cat: keyof typeof WEIGHTS, amount = 1) => {
    const cur = score.get(cat) ?? { count: 0, points: 0 };
    score.set(cat, { count: cur.count + 1, points: cur.points + WEIGHTS[cat] * amount });
  };
  const failures: string[] = [];
  let t = 0;
  let log: string[] = [];
  const fail = (msg: string) => {
    failures.push(`${fmt(t)} — ${msg}`);
    log.push(`[HARD FAILURE] ${msg}`);
  };

  const profileOf = (fid: string) => flightProfile(store.flights.get(fid)!, info);

  const blockedReason = (gid: string, fid: string, ivs: Interval[]) => {
    for (const b of gateAssignments[gid]) if (b.flight_id !== fid && setsConflict(ivs, b.intervals)) return `flight ${b.flight_id}`;
    for (const w of gateOutages[gid]) if (ivs.some((iv) => overlap(iv, w))) return `an outage [${fmt(w[0])}, ${fmt(w[1])}]`;
    return null;
  };
  const removeBooking = (gid: string, fid: string) => {
    gateAssignments[gid] = gateAssignments[gid].filter((b) => b.flight_id !== fid);
  };

  const view = (s: FlightState): FlightView => {
    const p = flightProfile(s, info);
    const firstLeg = s.legs[0];
    const ac = firstLeg?.aircraftType ?? "";
    const stations = [s.legs[0]?.departureStation, ...s.legs.map((l) => l.arrivalStation)].filter(Boolean);
    const filed = s.filed_intervals ?? p.intervals;
    return {
      id: s.flight_id,
      meta: { carrier: s.carrier, flightNumber: s.flight_number, flightSuffix: s.suffix, originatingDate: s.originating_date },
      legs: s.legs.map((l) => ({ ...l })),
      code: `${s.carrier} ${s.flight_number}`,
      route: stations.join(" → "),
      aircraftType: ac,
      aircraftName: info.aircraft_info[ac]?.name ?? ac,
      category: p.category,
      categoryName: p.category == null ? "—" : CATEGORY_NAME[p.category],
      wingspan: p.wingspan,
      jetbridge: p.jetbridge_required,
      intervals: p.intervals,
      filedIntervals: filed,
      delayMin: p.intervals.length && filed.length ? p.intervals[0][0] - filed[0][0] : 0,
      equipmentChanged: s.filed_aircraft && s.filed_aircraft !== ac ? (info.aircraft_info[s.filed_aircraft]?.name ?? s.filed_aircraft) : null,
      diversion: s.diversion,
      reason: s.reason,
      cancelled: s.cancelled,
      gate: flightAssignments.get(s.flight_id)?.gate ?? null,
      held: held.has(s.flight_id),
      strandedAt: stranded.get(s.flight_id) ?? null,
      lastAction: s.action,
      infoTime: s.info_time,
    };
  };

  const keys = new Set(Object.keys(scenario));
  for (const p of pins) keys.add(String(Math.floor(p.time / 60) * 100 + (p.time % 60)).padStart(4, "0"));
  const times = [...keys].map((k) => [keyToMin(k), k] as const).sort((a, b) => a[0] - b[0]);

  for (const [time, key] of times) {
    t = time;
    log = [];
    const tickMoves: MoveEvent[] = [];
    let decisions: Tick["decisions"] = { assignments: [], reassignments: [] };
    try {
      // 1) Apply messages
      const touched: string[] = [];
      const outaged = new Set<string>();
      for (const msg of scenario[key] ?? []) {
        if (msg.action === "GateRestore") {
          // Operator puts a gate back in service: any outage in progress ends now.
          const gid = msg.gate ?? "";
          if (!(gid in gates)) continue;
          gateOutages[gid] = gateOutages[gid]
            .map((w) => (w[0] <= t && t < w[1] ? ([w[0], t] as Interval) : w))
            .filter((w) => w[1] > w[0]);
          log.push(`[RESTORE] Gate ${gid} back in service`);
          continue;
        }
        if (msg.action === "GateOutage") {
          const [gid, w] = parseGateOutage(msg);
          if (!(gid in gates)) {
            log.push(`[WARN] GateOutage for unknown gate ${gid} (ignored).`);
            continue;
          }
          gateOutages[gid].push(w);
          outaged.add(gid);
          log.push(`[OUTAGE] Gate ${gid} unavailable ${w[1] >= OUTAGE_OPEN_END ? `from ${fmt(w[0])}` : fmtInterval(w)}`);
          continue;
        }
        const [fid, warn] = store.apply(msg, t);
        if (warn) log.push(`[WARN] ${warn}`);
        if (!fid) continue;
        touched.push(fid);
        const s = store.flights.get(fid)!;
        if (!s.filed_intervals) {
          s.filed_intervals = flightProfile(s, info).intervals;
          s.filed_aircraft = s.legs[0]?.aircraftType;
        }
        if (msg.action === "DivertFlight") log.push(`[DIVERT] Unscheduled ${s.reason} arrival: ${fid}`);
        else if (msg.action !== "CreateFlight") log.push(`[${msg.action.toUpperCase()}] ${fid}`);
      }
      const created = (scenario[key] ?? []).filter((m) => m.action === "CreateFlight").length;
      if (created) log.unshift(`[SCHEDULE] ${created} flight(s) filed`);

      // 2) Release cancelled flights
      for (const [fid, a] of [...flightAssignments]) {
        if (store.flights.get(fid)!.cancelled || !profileOf(fid).yyz_legs.length) {
          removeBooking(a.gate, fid);
          flightAssignments.delete(fid);
          log.push(`[CANCEL] ${fid} released gate ${a.gate}`);
        }
      }

      // 2b) Operator pins (manual gate changes) for this minute
      for (const pin of pins.filter((x) => x.time === t)) {
        const s = store.flights.get(pin.flight);
        if (pin.gate === null) {
          const prevGate = flightAssignments.get(pin.flight)?.gate;
          if (!s || !prevGate) continue;
          removeBooking(prevGate, pin.flight);
          flightAssignments.delete(pin.flight);
          held.add(pin.flight);
          log.push(`[UNASSIGN] Operator removed ${pin.flight} from ${prevGate}`);
          continue;
        }
        if (!s || s.cancelled || !(pin.gate in gates)) {
          log.push(`[MANUAL REJECTED] ${pin.flight} -> ${pin.gate}: unknown flight or gate`);
          continue;
        }
        const p = profileOf(pin.flight);
        const prev = flightAssignments.get(pin.flight)?.gate ?? null;
        if (prev === pin.gate) continue;
        const why = incompatibility(p, gates[pin.gate]) ?? blockedReason(pin.gate, pin.flight, p.intervals);
        if (why) {
          log.push(`[MANUAL REJECTED] ${pin.flight} -> ${pin.gate}: ${why}`);
          continue;
        }
        if (prev) removeBooking(prev, pin.flight);
        held.delete(pin.flight);
        stranded.delete(pin.flight);
        gateAssignments[pin.gate].push({ flight_id: pin.flight, intervals: p.intervals });
        flightAssignments.set(pin.flight, { gate: pin.gate, snapshot: p });
        if (prev) {
          const start = Math.min(...p.intervals.map((iv) => iv[0]));
          addScore(start <= t ? "reassignment_after_arrival" : "reassignment");
          const mv: MoveEvent = { flight: pin.flight, from: prev, to: pin.gate, time: t, cause: "manual" };
          tickMoves.push(mv);
          moves.push(mv);
        }
        log.push(`[MANUAL] Operator ${prev ? `moved ${pin.flight}: ${prev} -> ${pin.gate}` : `assigned ${pin.flight} -> ${pin.gate}`}`);
      }

      // 3) Flag assigned flights needing attention
      const flagged = new Map<string, Profile>();
      const reasons = new Map<string, "info" | "outage">();
      for (const fid of touched) {
        const a = flightAssignments.get(fid);
        if (!a) continue;
        const np = profileOf(fid);
        if (profileChanged(a.snapshot, np)) {
          flagged.set(fid, np);
          reasons.set(fid, "info");
        }
      }
      for (const [fid, a] of flightAssignments) {
        if (flagged.has(fid) || !outaged.has(a.gate)) continue;
        const p = profileOf(fid);
        if (p.intervals.some((iv) => gateOutages[a.gate].some((w) => overlap(iv, w)))) {
          flagged.set(fid, p);
          reasons.set(fid, "outage");
        }
      }

      // 4) Observation
      const waiting: Record<string, SolverFlight> = {};
      for (const [fid, s] of store.flights) {
        if (s.cancelled || flightAssignments.has(fid) || held.has(fid)) continue;
        const p = flightProfile(s, info);
        if (p.yyz_legs.length) waiting[fid] = solverView(p);
      }
      const changed: Record<string, { gate_id: string; new: SolverFlight }> = {};
      for (const [fid, np] of flagged) changed[fid] = { gate_id: flightAssignments.get(fid)!.gate, new: solverView(np) };

      decisions = decide({
        time: t,
        gates,
        gate_outages: Object.fromEntries(Object.entries(gateOutages).filter(([, w]) => w.length)),
        waiting_flights: waiting,
        changed_flights: changed,
        gate_assignments: Object.fromEntries(Object.entries(gateAssignments).map(([g, bs]) => [g, bs.map((b) => ({ ...b }))])),
      });

      // 5) Reassignments, then assignments.
      // HermesTC fix 3: reassignments happen together, so lift every moving flight off its old
      // gate first — otherwise X moving into Y's old slot is "blocked" by Y, which is also moving.
      const movingOut = new Map<string, Booking>();
      for (const [fid, ngid] of decisions.reassignments) {
        const a0 = flightAssignments.get(fid);
        if (!a0 || ngid === a0.gate) continue;
        const bk = gateAssignments[a0.gate].find((b) => b.flight_id === fid);
        if (bk) movingOut.set(fid, bk);
        removeBooking(a0.gate, fid);
      }
      // Flights that changed but stay put now occupy their gate at their *new* times (the planner
      // decided with those), so update their bookings before checking any moves against them.
      for (const [fid, np] of flagged) {
        if (movingOut.has(fid)) continue;
        const a0 = flightAssignments.get(fid);
        const bk = a0 && gateAssignments[a0.gate].find((b) => b.flight_id === fid);
        if (bk) bk.intervals = np.intervals;
      }
      const putBack = (fid: string) => {
        const bk = movingOut.get(fid);
        const a0 = flightAssignments.get(fid);
        if (bk && a0) gateAssignments[a0.gate].push(bk);
      };
      for (const [fid, ngid] of decisions.reassignments) {
        const a = flightAssignments.get(fid);
        if (!a) { fail(`Cannot reassign ${fid}: not currently assigned.`); continue; }
        if (!(ngid in gates)) { fail(`Invalid gate id '${ngid}' in reassignment of ${fid}.`); continue; }
        if (ngid === a.gate) continue;
        const p = profileOf(fid);
        const bad = incompatibility(p, gates[ngid]);
        if (bad) { fail(`Incompatible reassignment (${bad}): ${fid} -> ${ngid}.`); putBack(fid); continue; }
        const blk = blockedReason(ngid, fid, p.intervals);
        if (blk) { fail(`Reassignment of ${fid} -> ${ngid} blocked by ${blk}.`); putBack(fid); continue; }
        removeBooking(a.gate, fid);
        gateAssignments[ngid].push({ flight_id: fid, intervals: p.intervals });
        flightAssignments.set(fid, { gate: ngid, snapshot: p });
        const start = Math.min(...p.intervals.map((iv) => iv[0]));
        if (start <= t) addScore("reassignment_after_arrival");
        else if (!flagged.has(fid)) addScore("reassignment");
        const mv: MoveEvent = { flight: fid, from: a.gate, to: ngid, time: t, cause: reasons.get(fid) ?? "solver" };
        tickMoves.push(mv);
        moves.push(mv);
        log.push(`[REASSIGN] ${fid}: ${a.gate} -> ${ngid}  ${p.intervals.map(fmtInterval).join(", ")}`);
      }
      // 6) Flagged flights left in place must still be valid (settled before new assignments, so
      //    new flights are checked against their updated times — HermesTC ordering fix)
      for (const [fid, np] of flagged) {
        const a = flightAssignments.get(fid);
        if (!a) continue;
        // If its gate is no longer valid (outage, conflict, aircraft no longer fits) and the
        // re-plan found nowhere else, take it off the gate so it shows as unassigned rather
        // than leaving an invalid assignment in the plan.
        const bad = incompatibility(np, gates[a.gate]);
        const blk = bad ? null : blockedReason(a.gate, fid, np.intervals);
        if (bad || blk) {
          removeBooking(a.gate, fid);
          flightAssignments.delete(fid);
          const why = bad ? `no longer fits (${bad.toLowerCase()})` : blk!.startsWith("an outage") ? "gate out of service" : `gate needed by ${blk}`;
          stranded.set(fid, { gate: a.gate, reason: bad ? "incompatible" : blk!.startsWith("an outage") ? "outage" : "conflict" });
          log.push(`[DISPLACED] ${fid} removed from ${a.gate}: ${why}; no compatible gate free`);
          continue;
        }
        const b = gateAssignments[a.gate].find((x) => x.flight_id === fid);
        if (b) b.intervals = np.intervals;
        a.snapshot = np;
        if (!tickMoves.some((m) => m.flight === fid)) log.push(`[UPDATE] ${fid} @ ${a.gate} now ${np.intervals.map(fmtInterval).join(", ")} (still valid)`);
      }

      for (const [fid, gid] of decisions.assignments) {
        if (!(gid in gates)) { fail(`Invalid gate id '${gid}' for flight ${fid}.`); continue; }
        if (flightAssignments.has(fid)) { fail(`Flight ${fid} is already assigned; use reassignments.`); continue; }
        const p = profileOf(fid);
        const bad = incompatibility(p, gates[gid]);
        if (bad) { fail(`Incompatible assignment (${bad}): ${fid} -> ${gid}.`); continue; }
        const blk = blockedReason(gid, fid, p.intervals);
        if (blk) { fail(`Gate ${gid} unavailable for ${fid}: blocked by ${blk}.`); continue; }
        gateAssignments[gid].push({ flight_id: fid, intervals: p.intervals });
        flightAssignments.set(fid, { gate: gid, snapshot: p });
        stranded.delete(fid);
        log.push(`[ASSIGN] ${fid} -> ${gid}  ${p.intervals.map(fmtInterval).join(", ")}`);
      }

      // 7) HermesTC: if flights were taken off gates above, the gates they freed can serve
      // flights still waiting — run the planner once more for waiting flights only.
      if (log.some((l) => l.startsWith("[DISPLACED]"))) {
        const waiting2: Record<string, SolverFlight> = {};
        for (const [fid, s2] of store.flights) {
          if (s2.cancelled || flightAssignments.has(fid) || held.has(fid)) continue;
          const p = flightProfile(s2, info);
          if (p.yyz_legs.length) waiting2[fid] = solverView(p);
        }
        const second = decide({
          time: t,
          gates,
          gate_outages: Object.fromEntries(Object.entries(gateOutages).filter(([, w]) => w.length)),
          waiting_flights: waiting2,
          changed_flights: {},
          gate_assignments: Object.fromEntries(Object.entries(gateAssignments).map(([g, bs]) => [g, bs.map((b) => ({ ...b }))])),
        });
        for (const [fid, gid] of second.assignments) {
          const p = profileOf(fid);
          if (incompatibility(p, gates[gid]) || blockedReason(gid, fid, p.intervals)) continue;
          gateAssignments[gid].push({ flight_id: fid, intervals: p.intervals });
          flightAssignments.set(fid, { gate: gid, snapshot: p });
          const was = stranded.get(fid);
          stranded.delete(fid);
          if (was) {
            const mv: MoveEvent = { flight: fid, from: was.gate, to: gid, time: t, cause: was.reason === "outage" ? "outage" : "info" };
            tickMoves.push(mv);
            moves.push(mv);
            log.push(`[REASSIGN] ${fid}: ${was.gate} -> ${gid}  ${p.intervals.map(fmtInterval).join(", ")}`);
          } else log.push(`[ASSIGN] ${fid} -> ${gid}  ${p.intervals.map(fmtInterval).join(", ")}`);
        }
        decisions = { assignments: [...decisions.assignments, ...second.assignments], reassignments: decisions.reassignments };
      }
    } catch (e) {
      if (!(e instanceof HardFailure)) throw e;
      fail(e.message);
    }

    const flights: Record<string, FlightView> = {};
    for (const s of store.flights.values()) flights[s.flight_id] = view(s);
    const plan: Record<string, string[]> = {};
    for (const gid of Object.keys(gates)) plan[gid] = gateAssignments[gid].map((b) => b.flight_id);
    ticks.push({
      time: t,
      log,
      flights,
      plan,
      outages: Object.fromEntries(Object.entries(gateOutages).filter(([, w]) => w.length).map(([g, w]) => [g, w.map((x) => [...x] as Interval)])),
      moves: tickMoves,
      decisions,
    });
  }

  // Final soft score
  for (const [fid, a] of flightAssignments) {
    const g = gates[a.gate];
    if (g.dist > 0) addScore("walking_distance_per_m", g.dist);
    if (a.snapshot.category === DOMESTIC && g.gate_type === INTERNATIONAL) addScore("domestic_at_intl_gate");
    void fid;
  }
  const unassigned = [...store.flights.values()]
    .filter((s) => !flightAssignments.has(s.flight_id) && !s.cancelled && flightProfile(s, info).yyz_legs.length)
    .map((s) => s.flight_id);
  for (const fid of unassigned) addScore(store.flights.get(fid)!.diversion ? "unassigned_emergency" : "unassigned_flight");

  const bounds = ticks.flatMap((tk) => [
    ...Object.values(tk.flights).flatMap((f) => (f.cancelled ? [] : f.intervals.flat())),
    ...Object.values(tk.outages).flatMap((ws) => ws.flat().filter((v) => v < OUTAGE_OPEN_END)),
  ]);
  const breakdown: ScoreLine[] = [...score].map(([category, v]) => ({ category, ...v }));

  return {
    gates: Object.entries(gates)
      .map(([id, g]) => ({ id, ...g, typeName: GATE_TYPE_NAME[g.gate_type] }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    ticks,
    status: failures.length ? "FAILED" : "OK",
    failure: failures[0] ?? null,
    failures,
    score: failures.length ? null : breakdown.reduce((s, l) => s + l.points, 0),
    breakdown,
    assigned: flightAssignments.size,
    unassigned,
    timeMin: bounds.length ? Math.min(...bounds) : 0,
    timeMax: bounds.length ? Math.max(...bounds) : 1440,
  };
}

/** The recorded tick in effect at a given simulation minute. */
export function tickAt(result: SimResult, minute: number): Tick | null {
  let cur: Tick | null = null;
  for (const t of result.ticks) if (t.time <= minute) cur = t;
  return cur;
}
