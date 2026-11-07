# Gate Assignment Subproblem
## Table of Contents

- [Challenge](#challenge)
- [Potential Solutions](#potential-solutions)
- [Resources](#resources)

## The Problem
At Toronto Pearson Airport, a sudden gate malfunction forces an arriving aircraft to wait on the taxiway during a busy long weekend. Due to slow gate reassignment, passengers are left stuck on board. This leads to passengers missing connections and appointments. Inside the airport, crowds swell as other flights are also delayed, creating long walking distances and overwhelming staff. The airline ends up having to spend a significant amount of money on compensation and rebooking flights. The airline and airport are bombarded by complaints from very angry passengers from their customer service lines and on social media.

## Challenge
Ideally, the above scenario is something that airports want to avoid. As such, your challenge is to develop a solution that assigns airport gates to arriving and departing flights over time. Your solution must:

- Respect aircraft-gate compatibility
- Handle airline preferences and security concerns
- Adapt dynamically to delays, outages and emergencies (cascading changes)
- Minimize conflicts, delays and wasted time (optimization)

### Constraints 
The table below outlines some of that hard constraints that your solution must follow.
| Constraint | Rule |
| --- | --- |
| Occupancy | Two aircraft cannot use the same gate during overlapping intervals. |
| Aircraft size | The aircraft wingspan must fit the gate. |
| Jetbridge | An aircraft requiring a jetbridge must receive a jetbridge gate. |
| International | International flights require international gates. |
| Domestic | Domestic flights may use domestic or international gates, but international gates carry a soft penalty. |
| Cargo | Cargo flights require cargo gates; passenger flights cannot use them. |
| Gate outage | A flight cannot occupy a gate while that gate is unavailable. |
| Delay | An `UpdateTiming` message can extend a flight's gate-occupancy window. |
| Changed flight | A delay or equipment change may make the current gate invalid and require repair. |
| Reassignment | Moving an already assigned flight is allowed but adds a soft-score cost. |
| Walking distance | Gate distance contributes to the soft score. |

One thing that should be taken into consideration is that a gate typing is asymmetric. International flights require international gates because of customs processing. Domestic flights may use domestic or international gates, although using an international gate adds a soft penalty. Cargo flights require cargo gates, and passenger flights (international and domestic) cannot use them.

When a flight cannot be placed safely, leave it unassigned instead of returning an invalid assignment. The solution should fail gracefully instead of crashing.

### Choosing a scope
Make sure to pick a scope you can actually finish. A good solution should be able to answer questions such as:

- Can the plan handle a full day's schedule and the disruptions that land on top of it?
- Where does the current approach fall short, and what would fix it?
- Can an operator see what's happening and why, not just the raw assignments?
- Does it hold up beyond the sample scenarios?

## Potential Solutions

Three broad directions — improve what's here, replace it with something new, or build on top of it. The supplied algorithms are examples, not the only acceptable approach.

| Potential solution | Description | Starting point |
| --- | --- | --- |
| Improve the scoring-aware greedy heuristic algorithm | Take the included reference algorithm further: better cost function, smarter repair on disruption, less passenger walking.| [`Gate Sorting Algorithm`](gate-sorting-algorithm) |
| Build a new assignment algorithm | Write your own from scratch — e.g. a constraint solver using integer or constraint programming instead of a greedy heuristic. | [`evaluator.py`](gate-sorting-algorithm/evaluator.py) for the required interface |
| Disruption repair | Keep the existing plan stable and move only flights affected by a delay, outage, or equipment change. | [`flight_data/cascade_2.json`](gate-sorting-algorithm/flight_data/cascade_2.json) |
| Operator dashboard | Use the existing algorithm's output as a given and modify the dashboard to be able to better explain assignments, conflicts, and changes with a timeline or interactive control view. Try adding new features you think would be useful. | [`visualize.py`](gate-sorting-algorithm/visualize.py) |
| Scenario analysis | Compare algorithms across busy periods, emergencies, cargo, overnight flights, and outages. | [`flight_data/`](gate-sorting-algorithm/flight_data/) |
| First-fit assignment | The minimal baseline included — read it to understand the interface before building on or replacing it. | [`solution_firstfit.py`](gate-sorting-algorithm/solution_firstfit.py)|

## Resources
### Industry Context

Gate management software sits inside a larger airport technology stack. An **Airport Operational Database** holds shared flight and resource information. A **Resource Management System** uses that information to assign gates and stands. Changes then flow to passenger displays, airline systems, ground handlers, and airport staff.

Real systems must also handle **Irregular Operations (IROPS)**, including delays, equipment swaps, weather, gate outages, and other events that make a static gate plan obsolete. [Brock Solutions](https://www.brocksolutions.com/airports-and-airlines/), an engineering firm headquartered in Waterloo, builds this type of airport software through its SmartSuite platform for airports including SFO, JFK, Dublin, Sydney, and Toronto Pearson. This challenge is a simplified version of the same resource-planning problem.

| Challenge concept | Industry analogue |
| --- | --- |
| Static gate data | Airport resource inventory in an RMS or AODB |
| Flight schedule JSON | AODB flight schedule data |
| Flight update messages | Live operational updates |
| Gate outage messages | Resource availability updates |
| Aircraft-gate compatibility | Stand and gate planning rules |
| Occupancy conflicts | Gate and stand collision detection |
| Delay handling | IROPS recovery |
| Reassignment cost | Operational stability and passenger experience |
| Walking distance | Passenger service optimization |
| Hidden scenarios | Robustness against operational variability |

### Challenge Resources

- [Flight-message specification](gate-sorting-algorithm/JsonFlightMessageSpecification.md)
- [Gate and aircraft data](gate-sorting-algorithm/static_info.json)
- [Example scenarios](gate-sorting-algorithm/flight_data/)
- [Evaluator](gate-sorting-algorithm/evaluator.py)
- [Interactive visualizer](gate-sorting-algorithm/visualize.py)

### Safety and Industry References 

- [IATA Airport Handling Manual](https://www.iata.org/en/publications/manuals/ground-operations/): the industry reference for ground-handling policy and procedures
- [IATA Ground Operations Manual](https://www.iata.org/en/publications/manuals/iata-ground-operations-manual/): standard procedures for gate, ramp, and jetbridge work
- [IATA Safety Audit for Ground Operations](https://www.iata.org/en/programs/ops-infra/ground-operations/isago): the safety-audit framework used by ground-service providers
- [ICAO Annex 14: Aerodromes](https://store.icao.int/en/annex-14-aerodromes): international context for aerodrome, apron, and stand design
- [ICAO aerodrome safety information](https://www.icao.int/operational-safety/contingency-aerodromes): safety info for aerodrome infrastructure

### Additional References 
- [SKYbrary](https://skybrary.aero/articles/ground-handling): extra info on ground handling.
