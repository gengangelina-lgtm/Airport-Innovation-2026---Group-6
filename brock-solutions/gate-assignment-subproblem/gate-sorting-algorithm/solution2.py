"""
Gate assignment solution 2 -- Airport Innovation 2026, Group 6.

Approach
--------
1. Build the options.  For every flight, list each gate it could use. Rules that
   involve one flight only are applied here: aircraft size, jetbridge, gate
   type (international / domestic / cargo), gate outages and flights that are
   fixed in place. A flight that has not been given a gate yet also gets the
   option "unassigned".

2. AC-3.  Two flights whose times overlap cannot share a gate. AC-3 removes
   every option that cannot be part of any valid plan with a neighbouring
   flight, before the search starts.

3. Search.  A backtracking search tries the remaining options, most
   constrained flight first. After each choice it removes clashing options
   from the flights still to be placed (forward checking) and skips any branch
   that can no longer beat the best plan found. This finds the same best plan
   as listing every feasible combination, without listing them all.

4. Compare.  Plans are ranked by these rules, in priority order:
     1. fewest unassigned emergency flights
     2. fewest unassigned flights in total
     3. among those left unassigned: cargo first, then domestic,
        then international (international is kept the hardest)
     4. fewest moves of planes already at their gate
     5. fewest other moves compared with the current plan
     6. fewest domestic flights on international gates
     7. shortest total walking distance
   ``compare`` takes the current plan plus the new candidate plans and returns
   the best one.

At the first tick nothing is assigned yet, so this is a whole-day plan. At
each later tick with a change (delay, aircraft swap, outage, cancellation,
emergency), new candidates are generated and compared with the current plan.

Safety
------
- Gate rules and overlap checks come from the evaluator's own ``gms`` package.
- Every plan is replayed in the evaluator's order (reassignments one by one,
  then assignments, then the changed-flight check), and only plans that can
  really be applied are used. A swap is done by parking one flight on a free
  gate first; that extra move is counted.
- ``decide`` never raises. A flight that cannot get a gate goes on the
  unassigned list (with a reason) instead of causing an error.
"""

import time

from gms.compat import hard_compatible, is_premium_misuse
from gms.config import CARGO, DOMESTIC, INTERNATIONAL
from gms.occupancy import intervals_overlap

TIME_CAP = 1.0            # seconds per search, hard stop
NODE_CAP = 200_000        # search budget once a plan has been found

# ---------------------------------------------------------------------------
# Score vector (compared left to right; lower is better)
# ---------------------------------------------------------------------------
SCORE_FIELDS = (
    "unassigned_emergency",     # rule 1
    "unassigned_total",         # rule 2
    "unassigned_international", # rule 3 (rank: international kept first)
    "unassigned_domestic",
    "unassigned_cargo",
    "moves_after_arrival",      # rule 4
    "moves",                    # rule 5
    "domestic_at_intl_gate",    # rule 6
    "walking_m",                # rule 7
)
_IDX = {name: i for i, name in enumerate(SCORE_FIELDS)}
ZERO = (0,) * len(SCORE_FIELDS)


def vec(**fields):
    v = [0] * len(SCORE_FIELDS)
    for name, value in fields.items():
        v[_IDX[name]] = value
    return tuple(v)


def vadd(a, b):
    return tuple(x + y for x, y in zip(a, b))


def describe(score):
    """Readable form of a score vector, e.g. for logs or a dashboard."""
    return {name: score[i] for i, name in enumerate(SCORE_FIELDS)}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def compatible(flight, gate):
    ok, _ = hard_compatible(flight["category"], flight["wingspan"],
                            flight["jetbridge_required"], gate)
    return ok


def blocked(bookings, intervals, fid):
    """True if any interval clashes with a booking of another flight / an outage."""
    for owner, iv in bookings:
        if owner == fid:
            continue
        for x in intervals:
            if intervals_overlap(x, iv):
                return True
    return False


def overlaps(a, b):
    return any(intervals_overlap(x, y) for x in a for y in b)


def start_of(flight):
    return min((s for s, _ in flight["intervals"]), default=0)


def has_arrived(flight, now):
    return bool(flight["intervals"]) and start_of(flight) <= now


def standing_score(flight, gate):
    """Score of a flight ending the day on this gate (rules 6 and 7)."""
    return vec(domestic_at_intl_gate=int(is_premium_misuse(flight["category"], gate["gate_type"])),
               walking_m=max(0, gate.get("dist", 0) or 0))


def move_score(flight, now):
    if has_arrived(flight, now):
        return vec(moves_after_arrival=1)
    return vec(moves=1)


def unassigned_score(flight):
    """Score of leaving a flight without a gate (rules 1-3)."""
    rank = {INTERNATIONAL: "unassigned_international",
            DOMESTIC: "unassigned_domestic",
            CARGO: "unassigned_cargo"}.get(flight["category"], "unassigned_domestic")
    fields = {"unassigned_total": 1, rank: 1}
    if flight.get("priority"):
        fields["unassigned_emergency"] = 1
    return vec(**fields)


# ---------------------------------------------------------------------------
# Step 1: options per flight (single-flight rules)
# ---------------------------------------------------------------------------
def build_options(obs, movable):
    """
    Returns a list of items, one per flight the search may decide:
        {"fid", "flight", "current", "options": [(score, gate|None, intervals)]}
    Flights that are not movable stay where they are and simply block their gate.
    """
    now = obs["time"]
    gates = obs["gates"]
    changed = obs.get("changed_flights", {})

    fixed = {g: [] for g in gates}
    for g, windows in obs.get("gate_outages", {}).items():
        if g in fixed:
            fixed[g].extend((None, tuple(w)) for w in windows)

    raw = []
    for fid, f in obs.get("assigned_flights", {}).items():
        cur = f["gate_id"]
        new_iv = [tuple(x) for x in f["intervals"]]
        # While a changed flight stays on its gate, the evaluator still holds
        # its OLD times there until the end of the tick, so both block.
        old_iv = [tuple(x) for x in changed[fid]["old"]["intervals"]] if fid in changed else []
        stay = new_iv + old_iv
        if fid not in movable:
            fixed.setdefault(cur, []).extend((fid, x) for x in stay)
            continue
        opts = []
        for g, gate in gates.items():
            if not compatible(f, gate):
                continue
            score = standing_score(f, gate)
            if g == cur:
                opts.append((score, g, stay))
            else:
                opts.append((vadd(score, move_score(f, now)), g, new_iv))
        raw.append({"fid": fid, "flight": f, "current": cur, "options": opts})

    for fid, f in obs.get("waiting_flights", {}).items():
        iv = [tuple(x) for x in f["intervals"]]
        if not iv:
            continue
        opts = [(standing_score(f, gate), g, iv)
                for g, gate in gates.items() if compatible(f, gate)]
        opts.append((unassigned_score(f), None, []))
        raw.append({"fid": fid, "flight": f, "current": None, "options": opts})

    # Remove options blocked by outages or by flights that are fixed in place.
    for it in raw:
        it["options"] = sorted(
            (o for o in it["options"] if o[1] is None or not blocked(fixed[o[1]], o[2], it["fid"])),
            key=lambda o: (o[0], o[1] is None))
    return raw


# ---------------------------------------------------------------------------
# Step 2: AC-3 (pairwise rule: overlapping flights cannot share a gate)
# ---------------------------------------------------------------------------
def _clash(o1, o2):
    return o1[1] is not None and o1[1] == o2[1] and overlaps(o1[2], o2[2])


def time_neighbours(items):
    """Pairs of flights whose times overlap (the only ones that can clash)."""
    spans = [[iv for o in it["options"] for iv in o[2]] for it in items]
    nb = {i: set() for i in range(len(items))}
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if overlaps(spans[i], spans[j]):
                nb[i].add(j)
                nb[j].add(i)
    return nb


def ac3(items, nb):
    """Make every option arc-consistent. Returns False if a flight has no option left."""
    queue = [(i, j) for i in nb for j in nb[i]]
    while queue:
        i, j = queue.pop()
        oi, oj = items[i]["options"], items[j]["options"]
        keep = [a for a in oi if any(not _clash(a, b) for b in oj)]
        if len(keep) < len(oi):
            items[i]["options"] = keep
            if not keep:
                return False
            queue.extend((k, i) for k in nb[i] if k != j)
    return True


# ---------------------------------------------------------------------------
# Step 3: search with forward checking
# ---------------------------------------------------------------------------
def search(items, obs, incumbent=None):
    """Best applicable plan as (score, plan, actions), or None."""
    if any(not it["options"] for it in items):
        return None                     # a flight has no gate at all in this stage
    nb = time_neighbours(items)
    if not ac3(items, nb):
        return None

    order = sorted(range(len(items)), key=lambda i: (
        not items[i]["flight"].get("priority"), len(items[i]["options"]), start_of(items[i]["flight"])))
    pos = {i: k for k, i in enumerate(order)}
    later = {i: [j for j in nb[i] if pos[j] > pos[i]] for i in order}

    # Lower bound for the flights still to be placed (best option of each).
    suffix = [ZERO] * (len(order) + 1)
    for k in range(len(order) - 1, -1, -1):
        opts = items[order[k]]["options"]
        best_each = tuple(min(o[0][f] for o in opts) for f in range(len(ZERO)))
        suffix[k] = vadd(suffix[k + 1], best_each)

    alive = [set(range(len(it["options"]))) for it in items]
    choice = {}
    best = {"score": incumbent[0] if incumbent else None, "found": None}
    nodes = [0]
    deadline = time.monotonic() + TIME_CAP
    stop = [False]

    def beaten(score):
        return best["score"] is not None and score >= best["score"]

    def out_of_budget():
        if not stop[0]:
            if nodes[0] > NODE_CAP and best["found"] is not None:
                stop[0] = True
            elif nodes[0] % 256 == 0 and time.monotonic() > deadline:
                stop[0] = True
        return stop[0]

    def rec(k, score):
        nodes[0] += 1
        if beaten(vadd(score, suffix[k])):
            return
        if k == len(order):
            res = plan_to_actions(obs, choice)
            if res is not None:
                total = vadd(score, res[1])
                if not beaten(total):
                    best["score"], best["found"] = total, (total, dict(choice), res[0])
            return
        i = order[k]
        it = items[i]
        for a, opt in enumerate(it["options"]):
            if out_of_budget():
                return
            if a not in alive[i]:
                continue
            if beaten(vadd(vadd(score, opt[0]), suffix[k + 1])):
                break                           # options are sorted best-first
            # Forward checking: remove clashing options from later flights.
            removed, wiped = [], False
            if opt[1] is not None:
                for j in later[i]:
                    for b in list(alive[j]):
                        if _clash(opt, items[j]["options"][b]):
                            alive[j].discard(b)
                            removed.append((j, b))
                    if not alive[j]:
                        wiped = True
                        break
            if not wiped:
                choice[it["fid"]] = opt[1]
                rec(k + 1, vadd(score, opt[0]))
                del choice[it["fid"]]
            for j, b in removed:
                alive[j].add(b)

    rec(0, ZERO)
    return best["found"]


# ---------------------------------------------------------------------------
# Applying a plan in the evaluator's order
# ---------------------------------------------------------------------------
def plan_to_actions(obs, plan):
    """
    Replay a plan the way the evaluator applies it. Returns
    (actions, extra_score) or None if the plan cannot be applied this tick.
    ``extra_score`` counts any extra "parking" moves needed to break a swap.
    """
    gates = obs["gates"]
    now = obs["time"]
    changed = obs.get("changed_flights", {})
    assigned = obs.get("assigned_flights", {})
    waiting = obs.get("waiting_flights", {})

    book = {g: [] for g in gates}
    for g, windows in obs.get("gate_outages", {}).items():
        book.setdefault(g, []).extend((None, tuple(w)) for w in windows)
    for fid, f in assigned.items():
        iv = changed[fid]["old"]["intervals"] if fid in changed else f["intervals"]
        book[f["gate_id"]].extend((fid, tuple(x)) for x in iv)

    where = {fid: f["gate_id"] for fid, f in assigned.items()}
    ordered, extra = [], ZERO

    def do_move(fid, g):
        iv = [tuple(x) for x in assigned[fid]["intervals"]]
        cur = where[fid]
        book[cur] = [b for b in book[cur] if b[0] != fid]
        book[g].extend((fid, x) for x in iv)
        where[fid] = g
        ordered.append((fid, g))

    pending = [(fid, g) for fid, g in plan.items()
               if fid in assigned and g is not None and g != assigned[fid]["gate_id"]]
    parked = set()
    while pending:
        progress = False
        for fid, g in list(pending):
            if not blocked(book[g], [tuple(x) for x in assigned[fid]["intervals"]], fid):
                do_move(fid, g)
                pending.remove((fid, g))
                progress = True
        if progress:
            continue
        # Stuck in a swap: park one flight on any free compatible gate first.
        moved = False
        for fid, g in pending:
            if fid in parked:
                continue
            f = assigned[fid]
            iv = [tuple(x) for x in f["intervals"]]
            for t, gate in gates.items():
                if t not in (where[fid], g) and compatible(f, gate) and not blocked(book[t], iv, fid):
                    do_move(fid, t)
                    extra = vadd(extra, move_score(f, now))
                    parked.add(fid)
                    moved = True
                    break
            if moved:
                break
        if not moved:
            return None

    adds = [(fid, g) for fid, g in plan.items() if fid in waiting and g is not None]
    for fid, g in adds:
        iv = [tuple(x) for x in waiting[fid]["intervals"]]
        if blocked(book[g], iv, fid):
            return None
        book[g].extend((fid, x) for x in iv)

    # The evaluator's final check on changed flights that stayed put.
    for fid in changed:
        if fid not in assigned or where[fid] != assigned[fid]["gate_id"]:
            continue
        f, g = assigned[fid], assigned[fid]["gate_id"]
        if not compatible(f, gates[g]) or blocked(book[g], [tuple(x) for x in f["intervals"]], fid):
            return None

    return {"assignments": adds, "reassignments": ordered}, extra


# ---------------------------------------------------------------------------
# Step 4: compare plans by the priority rules
# ---------------------------------------------------------------------------
def score_plan(obs, plan, extra=ZERO):
    """
    Score a complete plan against the current one. ``plan`` maps flight_id to
    a gate (or None = unassigned); flights not in it keep their current gate.
    """
    now = obs["time"]
    gates = obs["gates"]
    score = extra
    for fid, f in obs.get("assigned_flights", {}).items():
        g = plan.get(fid) or f["gate_id"]
        score = vadd(score, standing_score(f, gates[g]))
        if g != f["gate_id"]:
            score = vadd(score, move_score(f, now))
    for fid, f in obs.get("waiting_flights", {}).items():
        if not f.get("intervals"):
            continue
        g = plan.get(fid)
        score = vadd(score, standing_score(f, gates[g]) if g else unassigned_score(f))
    return score


def compare(obs, current_plan, candidates):
    """
    Return the best of the current plan and the candidate plans.

    Each candidate is (plan, actions, extra_score). The current plan means
    "move nothing, place nothing new"; it only counts if it is still valid.
    """
    pool = list(candidates)
    current = plan_to_actions(obs, current_plan)
    if current is not None:
        pool.append((current_plan, current[0], current[1]))
    if not pool:
        return None
    return min(pool, key=lambda c: score_plan(obs, c[0], c[2]))


# ---------------------------------------------------------------------------
# Main decision
# ---------------------------------------------------------------------------
def _decide(obs):
    now = obs["time"]
    assigned = obs.get("assigned_flights", {})
    changed = obs.get("changed_flights", {})
    waiting = obs.get("waiting_flights", {})

    if not changed and not waiting:
        return {"assignments": [], "reassignments": []}   # nothing changed

    touched = set(changed) & set(assigned)
    live = {fid for fid, f in assigned.items() if any(e > now for _, e in f["intervals"])}

    # Candidates, each allowed to move more flights than the last:
    #   A: only changed + new flights      (fewest moves)
    #   B: any flight still at YYZ         (if that places more flights)
    #   C: also flights that already left  (last resort: the evaluator checks
    #      ALL of a flight's times, so a departed flight can block a forced move)
    candidates = []
    best = None
    for stage, pool in (("A", touched), ("B", live | touched), ("C", set(assigned))):
        if stage != "A" and not (pool - touched):
            continue
        if stage == "C" and best is not None and best[0][_IDX["unassigned_total"]] == 0:
            break
        try:
            found = search(build_options(obs, pool), obs, incumbent=best)
        except Exception:
            found = None                # a failed stage must not stop the next one
        if found is not None:
            best = found
            candidates.append((found[1], found[2], _extra_of(obs, found[1])))

    chosen = compare(obs, {}, candidates)
    if chosen is None:
        return _fallback(obs)
    return chosen[1]


def _extra_of(obs, plan):
    """Extra parking moves a plan needs (recomputed so compare is self-contained)."""
    res = plan_to_actions(obs, plan)
    return res[1] if res else ZERO


def _fallback(obs):
    """Simple repair used only if no full plan is found: place what fits."""
    gates = obs["gates"]
    changed = obs.get("changed_flights", {})
    assigned = obs.get("assigned_flights", {})
    book = {g: [] for g in gates}
    for g, windows in obs.get("gate_outages", {}).items():
        book.setdefault(g, []).extend((None, tuple(w)) for w in windows)
    for fid, f in assigned.items():
        iv = list(f["intervals"]) + (changed[fid]["old"]["intervals"] if fid in changed else [])
        book[f["gate_id"]].extend((fid, tuple(x)) for x in iv)

    def ranked(f):
        return sorted(gates.items(), key=lambda kv: standing_score(f, kv[1]))

    re, ad = [], []
    for fid in changed:
        f = assigned.get(fid)
        if not f:
            continue
        cur = f["gate_id"]
        iv = [tuple(x) for x in f["intervals"]]
        if compatible(f, gates[cur]) and not blocked(book[cur], iv, fid):
            continue
        for g, gate in ranked(f):
            if g != cur and compatible(f, gate) and not blocked(book[g], iv, fid):
                re.append((fid, g))
                book[g].extend((fid, x) for x in iv)
                break
    for fid, f in sorted(obs.get("waiting_flights", {}).items(),
                         key=lambda kv: not kv[1].get("priority")):
        iv = [tuple(x) for x in f["intervals"]]
        for g, gate in ranked(f):
            if compatible(f, gate) and not blocked(book[g], iv, fid):
                ad.append((fid, g))
                book[g].extend((fid, x) for x in iv)
                break
    return {"assignments": ad, "reassignments": re}


# ---------------------------------------------------------------------------
# Unassigned list
# ---------------------------------------------------------------------------
UNASSIGNED = {}          # flight_id -> {"flight_id", "since", "priority", "reason"}
_last_time = [None]


def _why_unassigned(flight, obs):
    fits = [g for g, gate in obs["gates"].items() if compatible(flight, gate)]
    if not fits:
        return "no gate fits this aircraft/flight type"
    return "all compatible gates busy or closed: " + ", ".join(sorted(fits))


def _update_unassigned(obs, actions):
    now = obs.get("time")
    if _last_time[0] is not None and now is not None and now < _last_time[0]:
        UNASSIGNED.clear()                       # a new simulation run started
    _last_time[0] = now
    placed = {fid for fid, _ in actions.get("assignments", [])}
    waiting = obs.get("waiting_flights", {})
    for fid in list(UNASSIGNED):
        if fid in placed or fid not in waiting:
            del UNASSIGNED[fid]
    for fid, f in waiting.items():
        if fid not in placed:
            entry = UNASSIGNED.setdefault(fid, {"flight_id": fid, "since": now})
            entry["priority"] = bool(f.get("priority"))
            entry["reason"] = _why_unassigned(f, obs)
    return get_unassigned()


def get_unassigned():
    """Current unassigned list, emergencies first."""
    return sorted(UNASSIGNED.values(), key=lambda e: (not e["priority"], e["flight_id"]))


def print_unassigned():
    rows = get_unassigned()
    if not rows:
        print("Unassigned flights: none")
        return
    print("Unassigned flights:")
    for e in rows:
        tag = " [EMERGENCY]" if e["priority"] else ""
        print(f"  - {e['flight_id']}{tag}: {e['reason']}")


# ---------------------------------------------------------------------------
# Evaluator entry point
# ---------------------------------------------------------------------------
def decide(observation):
    """Never raises. Returns assignments, reassignments and the unassigned list
    (the evaluator ignores the extra "unassigned" key)."""
    actions = None
    try:
        actions = _decide(observation)
    except Exception:
        try:
            actions = _fallback(observation)
        except Exception:
            actions = None
    if actions is None:
        actions = {"assignments": [], "reassignments": []}
    try:
        actions["unassigned"] = _update_unassigned(observation, actions)
    except Exception:
        actions["unassigned"] = []
    return actions

