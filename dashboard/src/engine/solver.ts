/**
 * TypeScript port of Group 6's gate-assignment algorithm
 * (gate-sorting-algorithm/sol.py): a scoring-aware cost function with a
 * branch-and-bound batch search. Changed flights are re-placed first (with a
 * reassignment penalty), then priority diversions, then normal waiting flights.
 */
import { CARGO, DOMESTIC, INTERNATIONAL, overlap } from "./model.ts";
import type { GateInfo, Interval } from "./model.ts";

export const REASSIGNMENT_PENALTY = 250;

export type SolverFlight = {
  intervals: Interval[];
  wingspan: number;
  jetbridge_required: boolean;
  category: number | null;
  priority?: boolean;
};

export type Booking = { flight_id: string; intervals: Interval[] };

export type Observation = {
  time: number;
  gates: Record<string, GateInfo>;
  gate_outages: Record<string, Interval[]>;
  waiting_flights: Record<string, SolverFlight>;
  changed_flights: Record<string, { gate_id: string; new: SolverFlight }>;
  gate_assignments: Record<string, Booking[]>;
};

export type Decision = { assignments: [string, string][]; reassignments: [string, string][] };

export function compatible(f: SolverFlight, g: GateInfo): boolean {
  if (f.wingspan > g.max_wingspan) return false;
  if (f.jetbridge_required && !g.jetbridge) return false;
  if (f.category === CARGO) return g.gate_type === CARGO;
  if (f.category === INTERNATIONAL) return g.gate_type === INTERNATIONAL;
  return g.gate_type === DOMESTIC || g.gate_type === INTERNATIONAL;
}

export function gateBlocked(
  gid: string,
  intervals: Interval[],
  local: Record<string, Booking[]>,
  outages: Record<string, Interval[]>,
  exclude?: string,
): boolean {
  for (const b of local[gid] ?? []) {
    if (b.flight_id === exclude) continue;
    if (intervals.some((x) => b.intervals.some((y) => overlap(x, y)))) return true;
  }
  for (const w of outages[gid] ?? []) if (intervals.some((x) => overlap(x, w))) return true;
  return false;
}

export function gateCost(f: SolverFlight, g: GateInfo): number {
  let cost = 0;
  if (f.category === DOMESTIC && g.gate_type === INTERNATIONAL) cost += 1000;
  if (!f.jetbridge_required && g.jetbridge) cost += 100;
  cost += Math.max(0, g.max_wingspan - f.wingspan);
  cost += Math.max(0, g.dist ?? 0);
  return cost;
}

const gateScore = (f: SolverFlight, g: GateInfo) => -gateCost(f, g);

export function bestGate(
  f: SolverFlight,
  gates: Record<string, GateInfo>,
  local: Record<string, Booking[]>,
  outages: Record<string, Interval[]>,
  exclude?: string,
): string | null {
  let bestGid: string | null = null;
  let best: number | null = null;
  for (const [gid, g] of Object.entries(gates)) {
    if (!compatible(f, g) || gateBlocked(gid, f.intervals, local, outages, exclude)) continue;
    const c = gateCost(f, g);
    if (best === null || c < best) {
      best = c;
      bestGid = gid;
    }
  }
  return bestGid;
}

type Candidate = { fid: string; flight: SolverFlight; kind: "changed" | "waiting"; current_gate?: string };

function globalBatchAssign(
  candidates: Candidate[],
  gates: Record<string, GateInfo>,
  local: Record<string, Booking[]>,
  outages: Record<string, Interval[]>,
): Map<string, string> {
  const out = new Map<string, string>();
  const n = candidates.length;
  if (!n) return out;

  const options: [string, number][][] = candidates.map((c) => {
    const opts: [string, number][] = [];
    for (const [gid, g] of Object.entries(gates)) {
      if (!compatible(c.flight, g)) continue;
      if (gateBlocked(gid, c.flight.intervals, local, outages, c.fid)) continue;
      let s = gateScore(c.flight, g);
      if (c.kind === "changed" && c.current_gate != null && gid !== c.current_gate) s -= REASSIGNMENT_PENALTY;
      opts.push([gid, s]);
    }
    return opts;
  });

  const order = [...Array(n).keys()].sort((a, b) => options[a].length - options[b].length);
  const suffix = new Array(n + 1).fill(0);
  for (let p = n - 1; p >= 0; p--) suffix[p] = suffix[p + 1] + Math.max(0, ...options[order[p]].map(([, s]) => s));

  const booked = new Map<string, Interval[]>();
  const chosen = new Map<number, string>();
  let bestScore = -Infinity;
  let bestCount = -1;
  let bestChosen = new Map<number, string>();

  const fits = (gid: string, ivs: Interval[]) => {
    const ex = booked.get(gid) ?? [];
    return !ivs.some((x) => ex.some((y) => overlap(x, y)));
  };

  const dfs = (p: number, sum: number, count: number) => {
    if (sum + suffix[p] < bestScore) return;
    if (p === n) {
      if (sum > bestScore || (sum === bestScore && count > bestCount)) {
        bestScore = sum;
        bestCount = count;
        bestChosen = new Map(chosen);
      }
      return;
    }
    const idx = order[p];
    const ivs = candidates[idx].flight.intervals;
    dfs(p + 1, sum, count); // skip
    for (const [gid, s] of options[idx]) {
      if (!fits(gid, ivs)) continue;
      const arr = booked.get(gid) ?? [];
      booked.set(gid, [...arr, ...ivs]);
      chosen.set(idx, gid);
      dfs(p + 1, sum + s, count + 1);
      chosen.delete(idx);
      if (arr.length) booked.set(gid, arr);
      else booked.delete(gid);
    }
  };
  dfs(0, 0, 0);

  for (const [idx, gid] of bestChosen) out.set(candidates[idx].fid, gid);
  return out;
}

export function decide(obs: Observation): Decision {
  const { gates } = obs;
  const outages = obs.gate_outages ?? {};
  const assignments: [string, string][] = [];
  const reassignments: [string, string][] = [];
  const local: Record<string, Booking[]> = {};
  for (const [gid, bs] of Object.entries(obs.gate_assignments)) local[gid] = [...bs];

  // 1) Changed flights: re-place with a reassignment penalty.
  const changed: Candidate[] = [];
  for (const [fid, info] of Object.entries(obs.changed_flights)) {
    local[info.gate_id] = (local[info.gate_id] ?? []).filter((b) => b.flight_id !== fid);
    changed.push({ fid, flight: info.new, kind: "changed", current_gate: info.gate_id });
  }
  // HermesTC fixes 1 & 2: a changed flight that can't be re-placed is still physically at its
  // gate, so it must keep that booking — and the batch must not hand its gate to anyone else.
  // Re-run the placement, treating newly stuck flights as fixed, until nothing new gets stuck.
  // (sol.py removed stuck flights from its working plan and could double-book their gates.)
  const base: Record<string, Booking[]> = {};
  for (const [gid, bs] of Object.entries(local)) base[gid] = [...bs];
  const stuck = new Set<string>();
  let work = base;
  let placed: [Candidate, string][] = [];
  for (let round = 0; round <= changed.length; round++) {
    work = {};
    for (const [gid, bs] of Object.entries(base)) work[gid] = [...bs];
    for (const c of changed) if (stuck.has(c.fid)) (work[c.current_gate!] ??= []).push({ flight_id: c.fid, intervals: c.flight.intervals });
    const movable = changed.filter((c) => !stuck.has(c.fid));
    const choice = globalBatchAssign(movable, gates, work, outages);
    placed = [];
    for (const c of movable) {
      const gid = choice.get(c.fid);
      if (gid == null) continue;
      (work[gid] ??= []).push({ flight_id: c.fid, intervals: c.flight.intervals });
      placed.push([c, gid]);
    }
    let newlyStuck = false;
    for (const c of movable) {
      if (choice.has(c.fid)) continue;
      const gid = bestGate(c.flight, gates, work, outages, c.fid);
      if (gid == null) {
        stuck.add(c.fid);
        newlyStuck = true;
        continue;
      }
      (work[gid] ??= []).push({ flight_id: c.fid, intervals: c.flight.intervals });
      placed.push([c, gid]);
    }
    if (!newlyStuck) break;
  }
  for (const gid of Object.keys(local)) delete local[gid];
  Object.assign(local, work);
  for (const [c, gid] of placed) if (gid !== c.current_gate) reassignments.push([c.fid, gid]);

  // 2) Waiting flights: priority diversions first, then normal.
  const waiting: Candidate[] = Object.entries(obs.waiting_flights).map(([fid, f]) => ({ fid, flight: f, kind: "waiting" }));
  for (const batch of [waiting.filter((c) => c.flight.priority), waiting.filter((c) => !c.flight.priority)]) {
    const choice = globalBatchAssign(batch, gates, local, outages);
    // HermesTC fix 2 (as above): batch choices first, then fallbacks.
    for (const c of batch) {
      const gid = choice.get(c.fid);
      if (gid == null) continue;
      assignments.push([c.fid, gid]);
      (local[gid] ??= []).push({ flight_id: c.fid, intervals: c.flight.intervals });
    }
    for (const c of batch) {
      if (choice.has(c.fid)) continue;
      const gid = bestGate(c.flight, gates, local, outages);
      if (gid == null) continue;
      assignments.push([c.fid, gid]);
      (local[gid] ??= []).push({ flight_id: c.fid, intervals: c.flight.intervals });
    }
  }
  return { assignments, reassignments };
}
