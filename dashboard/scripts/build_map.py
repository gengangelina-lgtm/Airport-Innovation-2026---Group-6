"""Build an SVG-ready overhead map of Toronto Pearson from OpenStreetMap data.

Usage: python3 -I build_map.py <osm_dir> <out_ts>
Data © OpenStreetMap contributors (ODbL).
"""
import json, math, sys

osm, out = sys.argv[1], sys.argv[2]
yyz = json.load(open(f"{osm}/yyz.json"))["elements"]
t3 = json.load(open(f"{osm}/t3b.json"))["elements"]

LON0, LON1, LAT0, LAT1 = -79.6365, -79.6045, 43.6748, 43.6893
K = math.cos(math.radians(43.68))
W = 1600
H = round(W * (LAT1 - LAT0) / ((LON1 - LON0) * K))
SX = W / (LON1 - LON0)
M_PER_PX = (LON1 - LON0) * K * 111320 / W


def P(lat, lon):
    return ((lon - LON0) * SX, (LAT1 - lat) * SX / K)


def simplify(pts, tol=0.8):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1e-9
    i, dmax = 0, -1
    for k in range(1, len(pts) - 1):
        d = abs(dy * (pts[k][0] - a[0]) - dx * (pts[k][1] - a[1])) / L
        if d > dmax:
            i, dmax = k, d
    if dmax > tol:
        return simplify(pts[: i + 1], tol)[:-1] + simplify(pts[i:], tol)
    return [a, b]


def path(pts, close):
    if close and len(pts) > 3:
        # Closed ring: split at the point farthest from the start so neither half is degenerate.
        far = max(range(len(pts)), key=lambda k: math.dist(pts[0], pts[k]))
        pts = simplify(pts[: far + 1])[:-1] + simplify(pts[far:])
    else:
        pts = simplify(pts)
    s = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return s + (" Z" if close else "")


def geom(e):
    return [P(p["lat"], p["lon"]) for p in e.get("geometry", [])]


def inside(pts):
    return any(0 <= x <= W and 0 <= y <= H for x, y in pts)


def tag(e, k):
    return e.get("tags", {}).get(k)


terminals, aprons, runways, taxiways, hangars = [], [], [], [], []
t1_pts = None
for e in yyz:
    if e["type"] != "way":
        continue
    a = tag(e, "aeroway")
    g = geom(e)
    if not g or not inside(g):
        continue
    if a == "terminal":
        terminals.append({"name": tag(e, "name"), "d": path(g, True)})
        if tag(e, "name") == "Terminal 1":
            t1_pts = g
    elif a == "apron":
        aprons.append(path(g, True))
    elif a == "runway":
        runways.append({"ref": tag(e, "ref"), "d": path(g, False)})
    elif a == "taxiway":
        taxiways.append(path(g, False))
    elif a in ("hangar", "control_center", "tower"):
        hangars.append(path(g, True))


def rings(members):
    """Join multipolygon outer member ways into closed rings."""
    segs = [[(p["lat"], p["lon"]) for p in m["geometry"]] for m in members if m.get("role") == "outer" and m.get("geometry")]
    out = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        out.append([P(la, lo) for la, lo in ring])
    return out


t3_pts = None
for e in t3:
    if e["type"] == "relation" and tag(e, "name") == "Terminal 3":
        rs = rings(e["members"])
        t3_pts = max(rs, key=len)
        terminals.append({"name": "Terminal 3", "d": " ".join(path(r, True) for r in rs)})

cargo = next(e for e in yyz if tag(e, "name") == "Cargo West")
cargo_pts = geom(cargo)
aprons_named = {"cargo": path(cargo_pts, True)}

gates_osm = {tag(e, "ref"): P(e["lat"], e["lon"]) for e in yyz if e["type"] == "node" and tag(e, "ref")}


def snap(poly, pt):
    best = None
    for i in range(len(poly) - 1):
        (x1, y1), (x2, y2) = poly[i], poly[i + 1]
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy or 1e-9
        t = max(0, min(1, ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / L2))
        q = (x1 + t * dx, y1 + t * dy)
        d = math.hypot(q[0] - pt[0], q[1] - pt[1])
        if best is None or d < best[0]:
            best = (d, i, q)
    _, i, q = best
    a, b = poly[max(0, i - 3)], poly[min(len(poly) - 1, i + 4)]
    ux, uy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(ux, uy) or 1
    ux, uy = ux / L, uy / L
    nx, ny = pt[0] - q[0], pt[1] - q[1]
    nl = math.hypot(nx, ny)
    if nl < 1e-6:
        nx, ny = -uy, ux
        nl = 1
    nx, ny = nx / nl, ny / nl
    half = 16
    return {
        "a": [round(q[0] - ux * half, 1), round(q[1] - uy * half, 1)],
        "b": [round(q[0] + ux * half, 1), round(q[1] + uy * half, 1)],
        "label": [round(q[0] + nx * 34, 1), round(q[1] + ny * 34, 1)],
    }


MAPPING = {"D1": "D31", "D2": "D35", "D3": "D39", "I1": "E70", "I2": "E74", "I3": "E77", "I4": "E80/F80"}
gates = {gid: snap(t1_pts, gates_osm[ref]) for gid, ref in MAPPING.items()}
cx = sum(p[0] for p in cargo_pts) / len(cargo_pts)
cy = sum(p[1] for p in cargo_pts) / len(cargo_pts)
east = max(p[0] for p in cargo_pts)
# Cargo gates sit along the longest edge of the Cargo West apron, offset outward.
edges = [(math.dist(cargo_pts[i], cargo_pts[i + 1]), i) for i in range(len(cargo_pts) - 1)]
_, ei = max(edges)
(x1, y1), (x2, y2) = cargo_pts[ei], cargo_pts[ei + 1]
for gid, t in (("C1", 0.3), ("C2", 0.7)):
    qx, qy = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
    vx, vy = qx - cx, qy - cy
    vl = math.hypot(vx, vy) or 1
    gates[gid] = snap(cargo_pts, (qx + vx / vl * 20, qy + vy / vl * 20))


def centroid(pts):
    return [round(sum(p[0] for p in pts) / len(pts), 1), round(sum(p[1] for p in pts) / len(pts), 1)]


labels = [
    {"text": "TERMINAL 1", "at": centroid(t1_pts)},
    {"text": "TERMINAL 3", "at": centroid(t3_pts)} if t3_pts else None,
    {"text": "CARGO WEST", "at": [round(cx, 1), round(cy, 1)]},
]
labels = [l for l in labels if l]

data = {
    "width": W,
    "height": H,
    "metersPerPx": round(M_PER_PX, 3),
    # Inverse of P(): lon = lon0 + x / sx ; lat = lat1 - y * k / sx  (for showing GPS positions)
    "projection": {"lon0": LON0, "lat1": LAT1, "sx": SX, "k": K},
    "terminals": terminals,
    "aprons": aprons,
    "cargoApron": aprons_named["cargo"],
    "runways": runways,
    "taxiways": taxiways,
    "hangars": hangars,
    "gates": gates,
    "labels": labels,
}
with open(out, "w") as f:
    f.write("// Overhead outline of Toronto Pearson (CYYZ) generated from OpenStreetMap data.\n")
    f.write("// Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).\n")
    f.write("// Gate segments are snapped to the real piers: D → Pier D, I → Pier E, C → Cargo West apron.\n")
    f.write("export const PEARSON_MAP = " + json.dumps(data, separators=(",", ":")) + " as const;\n")
print(W, H, len(terminals), len(aprons), len(runways), len(taxiways), len(hangars), {k: v["a"] for k, v in gates.items()})
