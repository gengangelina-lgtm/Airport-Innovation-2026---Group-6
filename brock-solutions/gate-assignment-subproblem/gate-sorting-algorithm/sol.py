"""
Reference solution (a cleaner, scoring-aware example).

Same hard-constraint handling as the starter (including gate outages), but
instead of the first compatible gate it picks the *best* one by a small cost
function:
  - keep domestic flights off international gates when possible (avoid the
    premium-gate penalty),
  - prefer a tighter wingspan fit,
  - prefer a shorter walking distance,
  - don't waste a jetbridge on a flight that doesn't need one.

This is a greedy heuristic, not an optimum, but it is correct and scores well
on the sample scenarios.
"""

import math

CARGO, DOMESTIC, INTERNATIONAL = 0, 1, 2
REASSIGNMENT_PENALTY = 250.0


def compatible(flight, gate) -> bool:
    if flight["wingspan"] > gate["max_wingspan"]:
        return False
    if flight["jetbridge_required"] and not gate["jetbridge"]:
        return False
    category, gate_type = flight["category"], gate["gate_type"]
    if category == CARGO:
        return gate_type == CARGO
    if category == INTERNATIONAL:
        return gate_type == INTERNATIONAL
    return gate_type in (DOMESTIC, INTERNATIONAL)


def _overlap(a, b) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def gate_blocked(gid, intervals, local, outages, exclude=None) -> bool:
    for booking in local.get(gid, []):
        if booking["flight_id"] == exclude:
            continue
        if any(_overlap(x, y) for x in intervals for y in booking["intervals"]):
            return True
    for window in outages.get(gid, []):
        if any(_overlap(x, window) for x in intervals):
            return True
    return False


def gate_cost(flight, gate) -> float:
    cost = 0.0
    if flight["category"] == DOMESTIC and gate["gate_type"] == INTERNATIONAL:
        cost += 1000
    if not flight["jetbridge_required"] and gate["jetbridge"]:
        cost += 100
    cost += max(0, gate["max_wingspan"] - flight["wingspan"])
    cost += max(0, gate.get("dist", 0))
    return cost


def gate_score(flight, gate) -> float:
    # maximize score == minimize cost
    return -gate_cost(flight, gate)


def best_gate(flight, gates, local, outages, exclude=None, skip=None):
    best_gid, best = None, None
    intervals = flight["intervals"]
    for gid, gate in gates.items():
        if gid == skip or not compatible(flight, gate):
            continue
        if gate_blocked(gid, intervals, local, outages, exclude):
            continue
        c = gate_cost(flight, gate)
        if best is None or c < best:
            best, best_gid = c, gid
    return best_gid


def _hungarian_min(cost):
    """
    Hungarian algorithm (min-cost), rectangular matrix supported.
    Returns assignment list `match_row_to_col` with -1 if unassigned.
    """
    n = len(cost)
    m = len(cost[0]) if n else 0
    if n == 0 or m == 0:
        return []

    transposed = False
    a = cost
    if n > m:
        # Hungarian expects rows <= cols. Transpose if needed.
        transposed = True
        a = [list(row) for row in zip(*a)]
        n, m = m, n

    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    p = [0] * (m + 1)
    way = [0] * (m + 1)

    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [math.inf] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = math.inf
            j1 = 0
            for j in range(1, m + 1):
                if not used[j]:
                    cur = a[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j] = cur
                        way[j] = j0
                    if minv[j] < delta:
                        delta = minv[j]
                        j1 = j
            for j in range(0, m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break

    # row->col for possibly transposed matrix
    row_to_col = [-1] * n
    for j in range(1, m + 1):
        if p[j] != 0:
            row_to_col[p[j] - 1] = j - 1

    if not transposed:
        return row_to_col

    # convert back when transposed: original rows were columns
    # now n(original) = m(current), m(original) = n(current)
    orig_rows = m
    inv = [-1] * orig_rows
    for r_t, c_t in enumerate(row_to_col):
        if c_t != -1:
            inv[c_t] = r_t
    return inv


def _global_batch_assign(candidates, gates, local, outages):
    """
    Conflict-aware batch assignment.
    Exact search (branch-and-bound): allows reusing a gate for non-overlapping
    flights inside the same batch.
    Returns list[(fid, gid)].
    """
    if not candidates:
        return []

    n = len(candidates)

    # Build feasible options per candidate: [(gid, score), ...]
    options = []
    for cand in candidates:
        fid = cand["fid"]
        flight = cand["flight"]
        cur = cand.get("current_gate")

        cand_opts = []
        for gid, gate in gates.items():
            if not compatible(flight, gate):
                continue
            if gate_blocked(gid, flight["intervals"], local, outages, exclude=fid):
                continue

            s = gate_score(flight, gate)
            if cand["kind"] == "changed" and cur is not None and gid != cur:
                s -= REASSIGNMENT_PENALTY
            cand_opts.append((gid, s))

        options.append(cand_opts)

    # Search order: hardest candidates first (fewest options)
    order = sorted(range(n), key=lambda i: len(options[i]))

    # Optimistic bound for pruning (skip allowed => max with 0)
    best_per_pos = [0.0] * n
    for p, idx in enumerate(order):
        best_per_pos[p] = max([0.0] + [s for _, s in options[idx]])
    suffix_bound = [0.0] * (n + 1)
    for p in range(n - 1, -1, -1):
        suffix_bound[p] = suffix_bound[p + 1] + best_per_pos[p]

    gate_booked = {}  # gid -> list of intervals assigned in THIS batch
    chosen = {}       # candidate index -> gid

    best_score = float("-inf")
    best_count = -1
    best_chosen = {}

    def fits_batch(gid, intervals):
        existing = gate_booked.get(gid, [])
        for x in intervals:
            for y in existing:
                if _overlap(x, y):
                    return False
        return True

    def add_batch(gid, intervals):
        gate_booked.setdefault(gid, []).extend(intervals)

    def remove_batch(gid, intervals):
        arr = gate_booked.get(gid, [])
        for _ in intervals:
            arr.pop()
        if not arr:
            gate_booked.pop(gid, None)

    def dfs(p, score_sum, assigned_count):
        nonlocal best_score, best_count, best_chosen

        if score_sum + suffix_bound[p] < best_score:
            return

        if p == n:
            if (score_sum > best_score) or (score_sum == best_score and assigned_count > best_count):
                best_score = score_sum
                best_count = assigned_count
                best_chosen = dict(chosen)
            return

        idx = order[p]
        flight = candidates[idx]["flight"]
        intervals = flight["intervals"]

        # Option 1: skip this candidate
        dfs(p + 1, score_sum, assigned_count)

        # Option 2: assign to a feasible gate that doesn't conflict in this batch
        for gid, s in options[idx]:
            if not fits_batch(gid, intervals):
                continue
            add_batch(gid, intervals)
            chosen[idx] = gid
            dfs(p + 1, score_sum + s, assigned_count + 1)
            chosen.pop(idx, None)
            remove_batch(gid, intervals)

    dfs(0, 0.0, 0)

    out = []
    for idx, gid in best_chosen.items():
        out.append((candidates[idx]["fid"], gid))
    return out


def decide(observation):
    gates = observation["gates"]
    outages = observation.get("gate_outages", {})
    assignments, reassignments = [], []
    local = {gid: list(bookings) for gid, bookings in observation["gate_assignments"].items()}

    # 1) Changed flights: global optimization with reassignment penalty.
    changed_candidates = []
    for fid, info in observation["changed_flights"].items():
        cur = info["gate_id"]
        new = info["new"]
        flight = {
            "intervals": new["intervals"],
            "wingspan": new["wingspan"],
            "jetbridge_required": new["jetbridge_required"],
            "category": new["category"],
        }

        # Remove previous booking first; we'll re-place this flight with updated data.
        local[cur] = [b for b in local.get(cur, []) if b["flight_id"] != fid]
        changed_candidates.append(
            {"fid": fid, "flight": flight, "kind": "changed", "current_gate": cur}
        )

    changed_choice = dict(_global_batch_assign(changed_candidates, gates, local, outages))

    for cand in changed_candidates:
        fid = cand["fid"]
        cur = cand["current_gate"]
        flight = cand["flight"]

        gid = changed_choice.get(fid)
        if gid is None:
            gid = best_gate(flight, gates, local, outages, exclude=fid)

        if gid is None:
            continue

        local.setdefault(gid, []).append({"flight_id": fid, "intervals": flight["intervals"]})
        if gid != cur:
            reassignments.append((fid, gid))

    # 2) Waiting flights: priority first, then normal, each batch globally optimized.
    waiting = observation["waiting_flights"]
    waiting_candidates = [
        {"fid": fid, "flight": f, "kind": "waiting", "priority": f.get("priority", False)}
        for fid, f in waiting.items()
    ]

    priority_batch = [c for c in waiting_candidates if c["priority"]]
    normal_batch = [c for c in waiting_candidates if not c["priority"]]

    for batch in (priority_batch, normal_batch):
        chosen = _global_batch_assign(batch, gates, local, outages)
        chosen_map = dict(chosen)

        for cand in batch:
            fid = cand["fid"]
            flight = cand["flight"]
            gid = chosen_map.get(fid)

            if gid is None:
                gid = best_gate(flight, gates, local, outages)

            if gid is None:
                continue

            assignments.append((fid, gid))
            local.setdefault(gid, []).append({"flight_id": fid, "intervals": flight["intervals"]})

    return {"assignments": assignments, "reassignments": reassignments}
