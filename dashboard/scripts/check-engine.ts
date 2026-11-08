// Runs Group 6's algorithm (TS port) over every scenario and prints a summary.
import { readFileSync, readdirSync } from "node:fs";
import { simulate } from "../src/engine/simulate.ts";
import { fmt } from "../src/engine/model.ts";

const dir = new URL("../../gate-sorting-algorithm/", import.meta.url);
const info = JSON.parse(readFileSync(new URL("static_info.json", dir), "utf8"));
const verbose = process.argv.includes("-v");
const files = [
  ...readdirSync(new URL("flight_data/", dir)).sort().map((f) => new URL(`flight_data/${f}`, dir)),
  ...readdirSync(new URL("../scenarios/", import.meta.url)).sort().map((f) => new URL(`../scenarios/${f}`, import.meta.url)),
];
for (const url of files) {
  const f = url.pathname.split("/").pop()!;
  const r = simulate(info, JSON.parse(readFileSync(url, "utf8")));
  console.log(`${f.padEnd(24)} ${r.status} score=${r.score?.toFixed(2)} assigned=${r.assigned} unassigned=${r.unassigned.length} ${r.failure ?? ""}`);
  if (verbose) for (const t of r.ticks) { console.log(`  t=${fmt(t.time)}`); t.log.forEach((l) => console.log("    " + l)); }
}
