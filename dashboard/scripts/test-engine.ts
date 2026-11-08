// HermesTC engine test suite.  Run:  npm test
//
// For every scenario (the challenge's flight_data/ plus dashboard/scenarios/) it replays the day and
// checks hard rules after every update; then it fuzzes thousands of random operator actions
// (move, unassign, outage, restore, retime) and re-checks everything.
import { readFileSync, readdirSync } from "node:fs";
import { simulate } from "../src/engine/simulate.ts";
import type { Pin, SimResult, Tick } from "../src/engine/simulate.ts";
import { fmt, incompatibility, overlap } from "../src/engine/model.ts";
import type { Scenario, StaticInfo } from "../src/engine/model.ts";
import { friendlyLog, gateRows, outageMessage, restoreMessage, retimeMessage, unassignedFlights, whyUnassigned, withInjections } from "../src/ops.ts";
import type { Injection } from "../src/ops.ts";

const algo = new URL("../../gate-sorting-algorithm/", import.meta.url);
const info: StaticInfo = JSON.parse(readFileSync(new URL("static_info.json", algo), "utf8"));
const scenarios: { name: string; data: Scenario }[] = [
  ...readdirSync(new URL("flight_data/", algo)).map((f) => ({ name: f, url: new URL(`flight_data/${f}`, algo) })),
  ...readdirSync(new URL("../scenarios/", import.meta.url)).map((f) => ({ name: f, url: new URL(`../scenarios/${f}`, import.meta.url) })),
]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(({ name, url }) => ({ name, data: JSON.parse(readFileSync(url, "utf8")) }));

let failures = 0;
let checks = 0;
const fail = (msg: string) => {
  failures++;
  if (failures <= 25) console.log("  ✗ " + msg);
};
const check = (ok: boolean, msg: () => string) => {
  checks++;
  if (!ok) fail(msg());
};

/** Hard rules that must hold in every recorded plan. */
function checkTick(name: string, sim: SimResult, t: Tick) {
  const where = `${name} @ ${fmt(t.time)}`;
  const seen = new Map<string, string>();
  for (const [gid, ids] of Object.entries(t.plan)) {
    const gate = info.gate_info[gid];
    for (const id of ids) {
      const f = t.flights[id];
      check(!!f, () => `${where}: unknown flight ${id} on ${gid}`);
      if (!f) continue;
      check(!seen.has(id), () => `${where}: ${id} on two gates (${seen.get(id)}, ${gid})`);
      seen.set(id, gid);
      check(f.gate === gid, () => `${where}: ${id} plan says ${gid} but flight says ${f.gate}`);
      check(!f.cancelled, () => `${where}: cancelled ${id} still holds ${gid}`);
      check(!f.held && !f.strandedAt, () => `${where}: held/stranded ${id} still in plan at ${gid}`);
      const bad = incompatibility({ category: f.category, wingspan: f.wingspan, jetbridge_required: f.jetbridge }, gate);
      check(!bad, () => `${where}: ${id} incompatible with ${gid} (${bad})`);
      for (const w of t.outages[gid] ?? [])
        check(!f.intervals.some((x) => overlap(x, w)), () => `${where}: ${id} on ${gid} during outage ${fmt(w[0])}–${fmt(w[1])}`);
    }
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = t.flights[ids[i]], b = t.flights[ids[j]];
        check(!a.intervals.some((x) => b.intervals.some((y) => overlap(x, y))), () => `${where}: ${ids[i]} and ${ids[j]} overlap on ${gid}`);
      }
  }
  // Completeness: nobody (except operator-held flights) is left waiting while a compatible gate is free.
  for (const f of unassignedFlights(t)) {
    if (f.held) continue;
    const free = sim.gates.filter((g) => {
      if (incompatibility({ category: f.category, wingspan: f.wingspan, jetbridge_required: f.jetbridge }, g)) return false;
      if ((t.outages[g.id] ?? []).some((w) => f.intervals.some((x) => overlap(x, w)))) return false;
      return !(t.plan[g.id] ?? []).some((id) => t.flights[id].intervals.some((x) => f.intervals.some((y) => overlap(x, y))));
    });
    // Flights stranded/displaced this tick get another chance at the next update, so only flag
    // waiting flights that were already waiting before this tick's decisions.
    const justDisplaced = t.log.some((l) => l.startsWith("[DISPLACED]") && l.includes(f.id));
    check(!free.length || justDisplaced, () => `${where}: ${f.id} unassigned but ${free.map((g) => g.id).join(",")} free`);
  }
  // View layer must not throw and must describe every log line.
  gateRows(sim, t, t.time + 1);
  for (const f of unassignedFlights(t)) whyUnassigned(sim, t, f);
  for (const l of t.log) {
    const e = friendlyLog(l);
    check(e === null || (e.text.length > 0 && !/[A-Z0-9]{2}-\w+-\d{4}-\d{2}-\d{2}/.test(e.text)), () => `${where}: unfriendly log "${e?.text}"`);
  }
}

function runAndCheck(name: string, data: Scenario, pins: Pin[] = []) {
  const sim = simulate(info, data, pins);
  check(sim.status === "OK", () => `${name}: hard failure ${sim.failure}`);
  for (const t of sim.ticks) checkTick(name, sim, t);
  return sim;
}

// 1) Every scenario as filed ------------------------------------------------------------------
console.log("\n1) Scenario replays");
const EXPECTED: Record<string, number> = {
  "busy_day.json": 23.2, "cancel.json": 1.5, "cargo.json": 2.5, "cascade_1.json": 5, "cascade_2.json": 4,
  "domestic_787.json": 6, "emergencies.json": 12, "equipment_upgrade.json": 6, "gate_outage.json": 2.5,
  "overnight.json": 3.5, "rush_hour.json": 32.5, "simple.json": 5,
};
for (const s of scenarios) {
  const before = failures;
  const sim = runAndCheck(s.name, s.data);
  if (s.name in EXPECTED) check(Math.abs((sim.score ?? -1) - EXPECTED[s.name]) < 1e-6, () => `${s.name}: score ${sim.score} ≠ expected ${EXPECTED[s.name]}`);
  const again = simulate(info, s.data);
  check(JSON.stringify(again.ticks) === JSON.stringify(sim.ticks), () => `${s.name}: replay is not deterministic`);
  const flights = Object.keys(sim.ticks.at(-1)?.flights ?? {}).length;
  console.log(`  ${failures === before ? "✓" : "✗"} ${s.name.padEnd(24)} ${String(flights).padStart(3)} flights · ${sim.assigned} assigned · ${sim.unassigned.length} unassigned · score ${sim.score?.toFixed(2)}`);
}

// 2) Random operator actions -------------------------------------------------------------------
console.log("\n2) Random operator actions (fuzz)");
let seed = Number(process.env.SEED ?? 12345);
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const RUNS = Number(process.env.FUZZ_RUNS ?? 60);
let actions = 0;
for (const s of scenarios) {
  const before = failures;
  const base = simulate(info, s.data);
  const lo = Math.min(base.timeMin, base.ticks[0]?.time ?? 0), hi = base.timeMax;
  const gates = Object.keys(info.gate_info);
  for (let run = 0; run < RUNS; run++) {
    const inj: Injection[] = [];
    const pins: Pin[] = [];
    let sim = base;
    const steps = 1 + Math.floor(rand() * 6);
    let time = Math.max(base.ticks[0]?.time ?? lo, lo);
    for (let k = 0; k < steps; k++) {
      time = Math.min(hi, time + Math.floor(rand() * 120));
      const tick = [...sim.ticks].reverse().find((t) => t.time <= time);
      if (!tick) continue;
      const live = Object.values(tick.flights).filter((f) => !f.cancelled && f.intervals.length && f.intervals.some((w) => w[1] > time));
      const kind = pick(["move", "move", "unassign", "outage", "restore", "retime"]);
      if (kind === "move" && live.length) pins.push({ time, flight: pick(live).id, gate: pick(gates) });
      if (kind === "unassign" && live.length) pins.push({ time, flight: pick(live).id, gate: null });
      if (kind === "outage") inj.push({ time, msg: outageMessage(pick(gates), time, time + 30 + Math.floor(rand() * 240)), label: "o" });
      if (kind === "restore") inj.push({ time, msg: restoreMessage(pick(gates)), label: "r" });
      if (kind === "retime") {
        const f = live.find((x) => x.intervals[0][0] > time);
        if (f) inj.push({ time, msg: retimeMessage(f, Math.floor(rand() * 180) - 60), label: "t" });
      }
      actions++;
      try {
        sim = runAndCheck(`${s.name} fuzz#${run}`, withInjections(s.data, inj), pins);
        if (process.env.DUMP && sim.status !== "OK") {
          console.log(JSON.stringify({ scenario: s.name, inj, pins }));
          process.exit(2);
        }
      } catch (e) {
        fail(`${s.name} fuzz#${run}: threw ${(e as Error).message}`);
        break;
      }
    }
  }
  console.log(`  ${failures === before ? "✓" : "✗"} ${s.name.padEnd(24)} ${RUNS} random runs`);
}

console.log(`\n${checks.toLocaleString()} checks · ${actions.toLocaleString()} random operator actions · ${failures ? `${failures} FAILED` : "all passed"}\n`);
process.exit(failures ? 1 : 0);
