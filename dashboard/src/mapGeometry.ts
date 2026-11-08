/**
 * Simulated aircraft positions ("GPS") on the Pearson map.
 *
 * The challenge data has gate times only, so movement is illustrative: an arriving aircraft
 * lands on the runway, then taxis along the real taxiway nearest its gate, reaching the gate
 * when its gate window starts; a departing aircraft does the reverse after its window ends;
 * an aircraft waiting for a gate holds on a taxiway.
 */
import { fmt } from "./engine/model.ts";
import type { FlightView, Tick } from "./engine/simulate.ts";
import { PEARSON_MAP } from "./data/pearsonMap.ts";

type Pt = [number, number];
type Line = { pts: Pt[]; cum: number[]; len: number };

const LANDING_MIN = 5; // on the runway before turning off
const TAXI_IN_MIN = 14; // runway exit → gate
const TAXI_OUT_MIN = 14; // gate → runway
const TAKEOFF_MIN = 3; // take-off roll

function parsePath(d: string): Pt[] {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function toLine(pts: Pt[]): Line {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

/** Point at distance `d` along the line. */
function at(line: Line, d: number): Pt {
  const t = Math.max(0, Math.min(line.len, d));
  let i = 1;
  while (i < line.cum.length - 1 && line.cum[i] < t) i++;
  const seg = line.cum[i] - line.cum[i - 1] || 1;
  const u = (t - line.cum[i - 1]) / seg;
  const [a, b] = [line.pts[i - 1], line.pts[i]];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

/** Distance along the line of the point closest to `p`, and how far away it is. */
function closest(line: Line, p: Pt): { along: number; dist: number } {
  let best = { along: 0, dist: Infinity };
  for (let i = 1; i < line.pts.length; i++) {
    const [a, b] = [line.pts[i - 1], line.pts[i]];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    const q: Pt = [a[0] + dx * u, a[1] + dy * u];
    const dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (dist < best.dist) best = { along: line.cum[i - 1] + Math.sqrt(L2) * u, dist };
  }
  return best;
}

/** Keep the longest stretch of a line that lies inside the visible map (with a small margin). */
function visible(pts: Pt[]): Pt[] {
  const M = 24;
  const inside = (p: Pt) => p[0] >= M && p[0] <= PEARSON_MAP.width - M && p[1] >= M && p[1] <= PEARSON_MAP.height - M;
  let best: Pt[] = [];
  let run: Pt[] = [];
  for (const p of pts) {
    if (inside(p)) run.push(p);
    else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  return run.length > best.length ? run : best;
}

const TAXIWAYS: Line[] = PEARSON_MAP.taxiways.map((d) => toLine(visible(parsePath(d)))).filter((l) => l.pts.length > 1 && l.len > 120);
const RUNWAYS: Line[] = PEARSON_MAP.runways.map((r) => toLine(visible(parsePath(r.d)))).filter((l) => l.pts.length > 1 && l.len > 100);

const gateMid = (gate: string): Pt | null => {
  const g = (PEARSON_MAP.gates as Record<string, { a: readonly number[]; b: readonly number[] }>)[gate];
  return g ? [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2] : null;
};

/** The taxiway closest to a gate, with the gate-side point and the far end to start/finish at. */
const taxiCache = new Map<string, { line: Line; gateAlong: number; farAlong: number } | null>();
function taxiFor(gate: string) {
  if (taxiCache.has(gate)) return taxiCache.get(gate)!;
  const p = gateMid(gate);
  let pick: { line: Line; gateAlong: number; farAlong: number } | null = null;
  if (p) {
    let bestDist = Infinity;
    for (const line of TAXIWAYS) {
      const c = closest(line, p);
      if (c.dist < bestDist) {
        bestDist = c.dist;
        pick = { line, gateAlong: c.along, farAlong: c.along > line.len / 2 ? 0 : line.len };
      }
    }
  }
  taxiCache.set(gate, pick);
  return pick;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export type PlaneDot = {
  flight: FlightView;
  x: number;
  y: number;
  phase: "landing" | "taxi-in" | "taxi-out" | "takeoff" | "holding";
  status: string;
  lat: number;
  lon: number;
};

const toGps = (x: number, y: number) => {
  const { lon0, lat1, sx, k } = PEARSON_MAP.projection;
  return { lon: lon0 + x / sx, lat: lat1 - (y * k) / sx };
};

export const fmtGps = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;

/** Aircraft that are moving or holding on the airfield at `minute`. */
export function planePositions(tick: Tick | null, minute: number): PlaneDot[] {
  if (!tick) return [];
  const out: PlaneDot[] = [];
  const runway = RUNWAYS[0];
  const add = (flight: FlightView, p: Pt, phase: PlaneDot["phase"], status: string) =>
    out.push({ flight, x: p[0], y: p[1], phase, status, ...toGps(p[0], p[1]) });

  for (const f of Object.values(tick.flights)) {
    if (f.cancelled || !f.intervals.length) continue;
    const gate = f.gate;
    const taxi = gate ? taxiFor(gate) : null;
    // Waiting for a gate: holding on a taxiway (spread out deterministically).
    if (!gate && !f.strandedAt && f.intervals.some((w) => w[0] <= minute && minute < w[1])) {
      const line = TAXIWAYS[hash(f.id) % TAXIWAYS.length];
      if (line) add(f, at(line, line.len * (0.25 + (hash(f.id + "h") % 50) / 100)), "holding", "Holding on taxiway · awaiting gate");
      continue;
    }
    if (!gate || !taxi) continue;
    const runwayDir = hash(f.id) % 2 === 0;
    for (const [s, e] of f.intervals) {
      if (minute >= s - TAXI_IN_MIN - LANDING_MIN && minute < s - TAXI_IN_MIN && runway) {
        const u = (minute - (s - TAXI_IN_MIN - LANDING_MIN)) / LANDING_MIN;
        add(f, at(runway, runway.len * (runwayDir ? u : 1 - u)), "landing", `Landing · on stand at ${gate} ${fmt(s)}`);
      } else if (minute >= s - TAXI_IN_MIN && minute < s) {
        const u = (minute - (s - TAXI_IN_MIN)) / TAXI_IN_MIN;
        add(f, at(taxi.line, taxi.farAlong + (taxi.gateAlong - taxi.farAlong) * u), "taxi-in", `Taxiing in to gate ${gate} · on stand ${fmt(s)}`);
      } else if (minute >= e && minute < e + TAXI_OUT_MIN) {
        const u = (minute - e) / TAXI_OUT_MIN;
        add(f, at(taxi.line, taxi.gateAlong + (taxi.farAlong - taxi.gateAlong) * u), "taxi-out", `Taxiing out from gate ${gate} · pushed back ${fmt(e)}`);
      } else if (minute >= e + TAXI_OUT_MIN && minute < e + TAXI_OUT_MIN + TAKEOFF_MIN && runway) {
        const u = (minute - e - TAXI_OUT_MIN) / TAKEOFF_MIN;
        add(f, at(runway, runway.len * (runwayDir ? 1 - u : u)), "takeoff", `Departing · left gate ${gate} ${fmt(e)}`);
      }
    }
  }
  return out;
}
