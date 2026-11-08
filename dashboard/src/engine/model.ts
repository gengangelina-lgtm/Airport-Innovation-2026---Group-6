/**
 * TypeScript port of the evaluator's domain model (gms/ package in
 * gate-sorting-algorithm/): flight messages, presence intervals,
 * classification and gate compatibility. Kept behaviour-identical so the
 * dashboard shows the same plan the Python evaluator would produce.
 */

export const HOME = "YYZ";
export const CARGO = 0;
export const DOMESTIC = 1;
export const INTERNATIONAL = 2;
export const CATEGORY_NAME = ["Cargo", "Domestic", "International"] as const;

export const PREP_MINUTES = 60;
export const GROUND_MINUTES = 60;
export const OUTAGE_OPEN_END = 7 * 24 * 60;

export const WEIGHTS = {
  reassignment: 10,
  reassignment_after_arrival: 50,
  domestic_at_intl_gate: 5,
  walking_distance_per_m: 0.01,
  unassigned_flight: 100,
  unassigned_emergency: 300,
} as const;

/* ------------------------------------------------------------ raw inputs */

export type GateInfo = { gate_type: number; max_wingspan: number; dist: number; jetbridge: number };
export type AircraftInfo = { name: string; wingspan: number; jetbridge_required: number; cargo: boolean };
export type StaticInfo = {
  gate_info: Record<string, GateInfo>;
  aircraft_info: Record<string, AircraftInfo>;
  stations: Record<string, string>;
};

export type Leg = {
  legType?: string;
  aircraftType: string;
  departureStation: string;
  arrivalStation: string;
  scheduledDepartureTime: string;
  scheduledArrivalTime: string;
};

export type Message = {
  action: string;
  flight?: { carrier: string; flightNumber: string; flightSuffix?: string | null; originatingDate: string };
  legs?: Leg[];
  reason?: string;
  cancelScope?: { type?: string; departureStation?: string; arrivalStation?: string };
  equipmentUpdate?: { scope?: string; aircraftType?: string; departureStation?: string; arrivalStation?: string };
  gate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string | null;
};

export type Scenario = Record<string, Message[]>;

export type Interval = [number, number];

/* ----------------------------------------------------------------- time */

export const hhmmToMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

export const keyToMin = (v: string) => {
  const n = parseInt(v, 10);
  return Math.floor(n / 100) * 60 + (n % 100);
};

export function absolutize(times: number[]): number[] {
  const out: number[] = [];
  let base = 0;
  let prev: number | null = null;
  for (const tod of times) {
    let t = tod + base;
    if (prev !== null && t < prev) {
      base += 1440;
      t = tod + base;
    }
    out.push(t);
    prev = t;
  }
  return out;
}

export function fmt(minute: number | null | undefined): string {
  if (minute == null) return "N/A";
  const m = Math.round(minute);
  const day = Math.floor(m / 1440);
  const mod = ((m % 1440) + 1440) % 1440;
  const base = `${String(Math.floor(mod / 60)).padStart(2, "0")}:${String(mod % 60).padStart(2, "0")}`;
  return day > 0 ? `${base}+${day}d` : base;
}

export const fmtInterval = (iv: Interval) => `${fmt(iv[0])}–${fmt(iv[1])}`;

/* ---------------------------------------------------------- flight store */

export type FlightState = {
  flight_id: string;
  carrier: string;
  flight_number: string;
  suffix: string | null;
  originating_date: string;
  legs: Leg[];
  cancelled: boolean;
  cancelled_legs: Set<string>;
  diversion: boolean;
  reason: string | null;
  info_time: number;
  action: string;
  /** Presence intervals as first filed — used to show delays. */
  filed_intervals?: Interval[];
  /** Aircraft type as first filed — used to show equipment swaps. */
  filed_aircraft?: string;
};

export const makeFlightId = (carrier: string, num: string, date: string, suffix?: string | null) =>
  `${carrier}-${num}${suffix ?? ""}-${date}`;

const routeKey = (dep?: string, arr?: string) => `${dep}>${arr}`;

const normLeg = (l: Leg): Leg => ({
  legType: l.legType,
  aircraftType: l.aircraftType,
  departureStation: l.departureStation,
  arrivalStation: l.arrivalStation,
  scheduledDepartureTime: l.scheduledDepartureTime,
  scheduledArrivalTime: l.scheduledArrivalTime,
});

export class FlightStore {
  flights = new Map<string, FlightState>();

  private fresh(fid: string, msg: Message, t: number): FlightState {
    return {
      flight_id: fid,
      carrier: msg.flight?.carrier ?? "",
      flight_number: msg.flight?.flightNumber ?? "",
      suffix: msg.flight?.flightSuffix ?? null,
      originating_date: msg.flight?.originatingDate ?? "",
      legs: (msg.legs ?? []).map(normLeg),
      cancelled: false,
      cancelled_legs: new Set(),
      diversion: false,
      reason: null,
      info_time: t,
      action: msg.action,
    };
  }

  /** Apply one message. Returns [flightId | null, warning | null]. */
  apply(msg: Message, t: number): [string | null, string | null] {
    const f = msg.flight ?? { carrier: "", flightNumber: "", originatingDate: "" };
    const fid = makeFlightId(f.carrier, f.flightNumber, f.originatingDate, f.flightSuffix);
    const state = this.flights.get(fid);
    switch (msg.action) {
      case "CreateFlight":
      case "ReplaceFlight": {
        const warn = msg.action === "CreateFlight" && state ? `CreateFlight for already-known ${fid}; treated as replace.` : null;
        this.flights.set(fid, this.fresh(fid, msg, t));
        return [fid, warn];
      }
      case "DivertFlight": {
        const s = this.fresh(fid, msg, t);
        s.diversion = true;
        s.reason = msg.reason ?? "diversion";
        this.flights.set(fid, s);
        return [fid, null];
      }
      case "UpdateTiming": {
        if (!state) return [null, `UpdateTiming for unknown flight ${fid} (ignored).`];
        for (const nl of msg.legs ?? []) {
          const match = state.legs.find((l) => routeKey(l.departureStation, l.arrivalStation) === routeKey(nl.departureStation, nl.arrivalStation));
          if (match) {
            match.scheduledDepartureTime = nl.scheduledDepartureTime ?? match.scheduledDepartureTime;
            match.scheduledArrivalTime = nl.scheduledArrivalTime ?? match.scheduledArrivalTime;
          }
        }
        state.info_time = t;
        state.action = "UpdateTiming";
        return [fid, null];
      }
      case "CancelFlight": {
        if (!state) return [null, `CancelFlight for unknown flight ${fid} (ignored).`];
        const scope = msg.cancelScope ?? {};
        state.info_time = t;
        state.action = "CancelFlight";
        if (scope.type === "SpecificLeg") {
          state.cancelled_legs.add(routeKey(scope.departureStation, scope.arrivalStation));
          if (!state.legs.some((l) => !state.cancelled_legs.has(routeKey(l.departureStation, l.arrivalStation)))) state.cancelled = true;
        } else state.cancelled = true;
        return [fid, null];
      }
      case "ReinstateFlight": {
        if (!state) return [null, `ReinstateFlight for unknown flight ${fid} (ignored).`];
        state.cancelled = false;
        state.cancelled_legs = new Set();
        state.info_time = t;
        state.action = "ReinstateFlight";
        return [fid, null];
      }
      case "UpdateEquipment": {
        if (!state) return [null, `UpdateEquipment for unknown flight ${fid} (ignored).`];
        const upd = msg.equipmentUpdate ?? {};
        if (!upd.aircraftType) return [fid, "UpdateEquipment with no aircraftType (ignored)."];
        for (const leg of state.legs) {
          if (upd.scope !== "SpecificLeg" || routeKey(leg.departureStation, leg.arrivalStation) === routeKey(upd.departureStation, upd.arrivalStation))
            leg.aircraftType = upd.aircraftType;
        }
        state.info_time = t;
        state.action = "UpdateEquipment";
        return [fid, null];
      }
    }
    return [null, `Unknown action '${msg.action}' (ignored).`];
  }
}

export function parseGateOutage(msg: Message): [string, Interval] {
  const start = hhmmToMin(msg.scheduledStartTime ?? "00:00");
  if (msg.scheduledEndTime == null) return [msg.gate ?? "", [start, OUTAGE_OPEN_END]];
  const [s, e] = absolutize([start, hhmmToMin(msg.scheduledEndTime)]);
  return [msg.gate ?? "", [s, e]];
}

/* ---------------------------------------------------------------- profile */

export type AbsLeg = Leg & { dep_abs: number; arr_abs: number };

export type Profile = {
  flight_id: string;
  intervals: Interval[];
  category: number | null;
  wingspan: number;
  jetbridge_required: boolean;
  yyz_legs: AbsLeg[];
  diversion: boolean;
  reason: string | null;
};

export function buildPresences(legs: AbsLeg[]): Interval[] {
  const out: Interval[] = [];
  let since: number | null = null;
  for (const leg of legs) {
    if (leg.arrivalStation === HOME) since = leg.arr_abs;
    if (leg.departureStation === HOME) {
      if (since !== null) {
        out.push([since, leg.dep_abs]);
        since = null;
      } else out.push([leg.dep_abs - PREP_MINUTES, leg.dep_abs]);
    }
  }
  if (since !== null) out.push([since, since + GROUND_MINUTES]);
  return out;
}

export function stationType(station: string, stations: Record<string, string>) {
  if (station === HOME) return "home";
  return stations[station] ?? "international";
}

export function classify(yyzLegs: Leg[], ac: Record<string, AircraftInfo>, stations: Record<string, string>) {
  if (yyzLegs.some((l) => ac[l.aircraftType]?.cargo)) return CARGO;
  for (const l of yyzLegs) {
    const other = l.departureStation === HOME ? l.arrivalStation : l.departureStation;
    if (stationType(other, stations) === "international") return INTERNATIONAL;
  }
  return DOMESTIC;
}

export function flightProfile(state: FlightState, info: StaticInfo): Profile {
  const empty: Profile = {
    flight_id: state.flight_id,
    intervals: [],
    category: null,
    wingspan: 0,
    jetbridge_required: false,
    yyz_legs: [],
    diversion: false,
    reason: null,
  };
  if (state.cancelled) return empty;
  const active = state.legs.filter((l) => !state.cancelled_legs.has(routeKey(l.departureStation, l.arrivalStation)));
  if (!active.length) return empty;
  const abs = absolutize(active.flatMap((l) => [hhmmToMin(l.scheduledDepartureTime), hhmmToMin(l.scheduledArrivalTime)]));
  const legs: AbsLeg[] = active.map((l, i) => ({ ...l, dep_abs: abs[2 * i], arr_abs: abs[2 * i + 1] }));
  const yyz = legs.filter((l) => l.departureStation === HOME || l.arrivalStation === HOME);
  if (!yyz.length) return empty;
  const ac = info.aircraft_info;
  return {
    flight_id: state.flight_id,
    intervals: buildPresences(legs),
    category: classify(yyz, ac, info.stations),
    wingspan: Math.max(...yyz.map((l) => Number(ac[l.aircraftType]?.wingspan ?? 0))),
    jetbridge_required: yyz.some((l) => Boolean(ac[l.aircraftType]?.jetbridge_required)),
    yyz_legs: yyz,
    diversion: state.diversion,
    reason: state.reason,
  };
}

/* ---------------------------------------------------------- compatibility */

export const overlap = (a: Interval, b: Interval) => a[0] < b[1] && b[0] < a[1];
export const setsConflict = (a: Interval[], b: Interval[]) => a.some((x) => b.some((y) => overlap(x, y)));

export function typeAllowed(category: number, gateType: number) {
  if (category === CARGO) return gateType === CARGO;
  if (category === INTERNATIONAL) return gateType === INTERNATIONAL;
  return gateType === DOMESTIC || gateType === INTERNATIONAL;
}

/** Hard constraints: returns null when OK, else a human-readable reason. */
export function incompatibility(p: Pick<Profile, "category" | "wingspan" | "jetbridge_required">, g: GateInfo): string | null {
  if (p.wingspan > g.max_wingspan) return `Wingspan ${p.wingspan}m > ${g.max_wingspan}m`;
  if (p.jetbridge_required && !g.jetbridge) return "No jetbridge";
  if (p.category !== null && !typeAllowed(p.category, g.gate_type)) {
    if (p.category === CARGO) return "Cargo gate required";
    if (g.gate_type === CARGO) return "Cargo-only gate";
    return "Customs gate required";
  }
  return null;
}
