"""Generate extra-busy stress-test scenarios for the HermesTC dashboard.

Writes JSON files in the challenge's flight-message format to dashboard/scenarios/.
Deterministic (fixed seeds), so the files are reproducible.

Usage:  python3 scripts/make_scenarios.py
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "scenarios")
DATE = "2025-06-15"

DOMESTIC = ["YVR", "YUL", "YOW", "YYC", "YHZ", "YYJ", "YEG", "YWG", "YQB"]
INTL = ["LHR", "CDG", "FRA", "NRT", "DXB", "JFK", "LAX", "SFO", "AMS", "ORD"]
DOM_CARRIERS = ["AC", "WS", "PD", "TS", "F8"]
INTL_CARRIERS = ["BA", "AF", "LH", "UA", "DL", "EK", "KL", "AA"]
CARGO_CARRIERS = ["FX", "5X", "QY"]


def hhmm(m):
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


class Builder:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.used = set()
        self.flights = []  # (meta, legs, kind)

    def number(self, carrier):
        while True:
            n = str(self.rng.randint(100, 989))
            if (carrier, n) not in self.used:
                self.used.add((carrier, n))
                return n

    def flight(self, category, pattern, t, ac=None, turn=None):
        """category: dom|intl|cargo; pattern: turn|arr|dep; t = minute YYZ arrival (or departure for dep)."""
        r = self.rng
        if category == "dom":
            carrier, other = r.choice(DOM_CARRIERS), r.choice(DOMESTIC)
            ac = ac or r.choice(["73G", "321", "73G", "321", "789"])
        elif category == "intl":
            carrier, other = r.choice(INTL_CARRIERS), r.choice(INTL)
            ac = ac or r.choice(["321", "73G", "789", "789"])
        else:
            carrier, other = r.choice(CARGO_CARRIERS), r.choice(DOMESTIC + INTL)
            ac = "76F"
        block = r.randint(70, 240) if category != "dom" else r.randint(60, 180)
        meta = {"carrier": carrier, "flightNumber": self.number(carrier), "flightSuffix": None, "originatingDate": DATE}
        legs = []
        if pattern in ("turn", "arr"):
            legs.append({"legType": "Originating", "aircraftType": ac, "departureStation": other, "arrivalStation": "YYZ",
                         "scheduledDepartureTime": hhmm(t - block), "scheduledArrivalTime": hhmm(t)})
        if pattern == "turn":
            dep = t + (turn or r.choice([50, 60, 75, 90, 105, 120]))
            legs.append({"legType": "Through", "aircraftType": ac, "departureStation": "YYZ", "arrivalStation": other,
                         "scheduledDepartureTime": hhmm(dep), "scheduledArrivalTime": hhmm(dep + block)})
        if pattern == "dep":
            legs.append({"legType": "Originating", "aircraftType": ac, "departureStation": "YYZ", "arrivalStation": other,
                         "scheduledDepartureTime": hhmm(t), "scheduledArrivalTime": hhmm(t + block)})
        self.flights.append((meta, legs, category))
        return meta, legs

    def create_all(self):
        return [{"action": "CreateFlight", "flight": m, "legs": l} for m, l, _ in self.flights]


def shift_legs(legs, delta):
    out = []
    for l in legs:
        d = dict(l)
        for k in ("scheduledDepartureTime", "scheduledArrivalTime"):
            h, mm = map(int, l[k].split(":"))
            d[k] = hhmm(h * 60 + mm + delta)
        out.append(d)
    return out


def timing(meta, legs, delta):
    return {"action": "UpdateTiming", "flight": meta, "legs": shift_legs(legs, delta)}


def cancel(meta, leg=None):
    scope = {"type": "AllLegs"} if leg is None else {"type": "SpecificLeg", "departureStation": leg["departureStation"], "arrivalStation": leg["arrivalStation"]}
    return {"action": "CancelFlight", "flight": meta, "cancelScope": scope}


def equipment(meta, ac):
    return {"action": "UpdateEquipment", "flight": meta, "equipmentUpdate": {"scope": "AllLegs", "aircraftType": ac}}


def outage(gate, start, end):
    return {"action": "GateOutage", "gate": gate, "scheduledStartTime": hhmm(start), "scheduledEndTime": None if end is None else hhmm(end)}


def divert(b, reason, origin, ac, arr):
    carrier = b.rng.choice(DOM_CARRIERS + INTL_CARRIERS)
    meta = {"carrier": carrier, "flightNumber": b.number(carrier), "flightSuffix": None, "originatingDate": DATE}
    legs = [{"legType": "Originating", "aircraftType": ac, "departureStation": origin, "arrivalStation": "YYZ",
             "scheduledDepartureTime": hhmm(arr - 90), "scheduledArrivalTime": hhmm(arr)}]
    return {"action": "DivertFlight", "reason": reason, "flight": meta, "legs": legs}


def write(name, schedule):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.json")
    with open(path, "w") as f:
        json.dump(schedule, f, indent=2)
    n = sum(1 for msgs in schedule.values() for m in msgs if m["action"] in ("CreateFlight", "DivertFlight"))
    print(f"{name}: {n} flights, {sum(len(v) for v in schedule.values())} messages, ticks {sorted(schedule)}")


def super_busy():
    """~60 flights spread over 05:30–23:30 with a realistic mix and disruptions all day."""
    b = Builder(1101)
    for i in range(60):
        t = 330 + i * 17 + b.rng.randint(-8, 8)
        cat = b.rng.choices(["dom", "intl", "cargo"], weights=[50, 38, 12])[0]
        pattern = b.rng.choices(["turn", "arr", "dep"], weights=[60, 20, 20])[0]
        b.flight(cat, pattern, t)
    # overnight turnarounds crossing midnight
    b.flight("intl", "turn", 23 * 60 + 20, ac="789", turn=110)
    b.flight("dom", "turn", 23 * 60 + 40, ac="321", turn=90)
    f = b.flights
    sched = {"0500": b.create_all()}
    sched["0830"] = [timing(f[i][0], f[i][1], d) for i, d in ((12, 40), (14, 25), (17, 75))]
    sched["0945"] = [outage("D2", 600, 840), outage("I1", 660, 750)]
    sched["1115"] = [divert(b, "medical", "YQB", "321", 11 * 60 + 40), divert(b, "turnback", "LHR", "789", 11 * 60 + 50)]
    sched["1230"] = [equipment(f[30][0], "789"), cancel(f[33][0])]
    sched["1500"] = [timing(f[38][0], f[38][1], 55), timing(f[40][0], f[40][1], 30), outage("C1", 15 * 60 + 30, 18 * 60)]
    sched["1800"] = [cancel(f[48][0], f[48][1][-1]) if len(f[48][1]) > 1 else cancel(f[48][0]), timing(f[50][0], f[50][1], 45)]
    write("super_busy", sched)


def overload():
    """30 flights crammed into 10:00–14:00 — more than the gates can hold, so some go unassigned."""
    b = Builder(2202)
    for i in range(30):
        t = 600 + i * 8 + b.rng.randint(-5, 5)
        cat = b.rng.choices(["dom", "intl", "cargo"], weights=[50, 40, 10])[0]
        b.flight(cat, "turn", t, turn=b.rng.choice([90, 105, 120, 150]))
    f = b.flights
    sched = {"0500": b.create_all()}
    sched["0900"] = [outage("I4", 600, 780)]
    sched["1030"] = [divert(b, "medical", "YOW", "73G", 11 * 60), timing(f[5][0], f[5][1], 60)]
    sched["1200"] = [equipment(f[18][0], "789"), cancel(f[22][0])]
    write("overload_crunch", sched)


def storm():
    """Weather day: cascading delays, three outages, diversions, equipment swaps and cancellations."""
    b = Builder(3303)
    for i in range(40):
        t = 360 + i * 22 + b.rng.randint(-10, 10)
        cat = b.rng.choices(["dom", "intl", "cargo"], weights=[48, 40, 12])[0]
        pattern = b.rng.choices(["turn", "arr", "dep"], weights=[65, 20, 15])[0]
        b.flight(cat, pattern, t)
    f = b.flights
    sched = {"0500": b.create_all()}
    sched["0700"] = [outage("D1", 7 * 60 + 30, 12 * 60), outage("I2", 8 * 60, None)]  # I2 out until further notice
    sched["0815"] = [timing(f[i][0], f[i][1], d) for i, d in ((4, 90), (5, 120), (6, 60), (7, 45), (8, 150))]
    sched["0930"] = [divert(b, "weather", "JFK", "321", 9 * 60 + 55), divert(b, "medical", "YUL", "73G", 10 * 60 + 5),
                     divert(b, "turnback", "FRA", "789", 10 * 60 + 20)]
    sched["1100"] = [equipment(f[16][0], "789"), equipment(f[18][0], "73G"), cancel(f[19][0]), cancel(f[20][0])]
    sched["1330"] = [outage("C2", 13 * 60 + 30, 16 * 60), timing(f[24][0], f[24][1], 80)]
    sched["1600"] = [timing(f[30][0], f[30][1], 40), cancel(f[31][0], f[31][1][0])]
    write("storm_day", sched)


if __name__ == "__main__":
    super_busy()
    overload()
    storm()
