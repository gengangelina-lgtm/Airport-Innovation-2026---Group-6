> This is the original hackathon challenge brief. For docs on the system that was actually built, see the top-level [README](../README.md).

# Departure Control System Automation

## Challenge overview

A Departure Control System (DCS) is the software that runs the departure side of an airline operation: check-in, passenger and document verification, baggage acceptance, boarding pass issuance, boarding control, as well as weight and balance.

In practice a DCS is answering questions such as:

- Is this passenger correctly identified, and are their documents valid for the destination?
- How many bags should we expect from this passenger or group?
- Is the aircraft load balanced across cabin and cargo hold?
- Which passengers might miss boarding, misconnect, or cause downstream problems?
- Has a given bag moved from check-in through screening, sorting, and loading?
- Can check-in, baggage, identity, and boarding all be seen from one place?

This challenge is a scaled-down version of that problem. You're not building an airline-grade system, you're building one or more of the core pieces: predictive passenger processing, load balancing, identity workflows, or baggage tracking.

## Industry context

Airline departure operations run on several systems staying in sync: passenger records, schedules, seat maps, aircraft configuration, baggage data, document checks, boarding status, and load constraints, all changing right up to departure.

A DCS sits at the center of that. It takes in passenger and booking data, runs check-in, accepts bags, validates documents, issues boarding passes, tracks boarding, and feeds the load control process — continuously, as passengers check in, bags move, seats change, and departure gets closer.

Most of this used to be rule-based and manually supervised. The industry is now shifting toward predictive, AI-assisted processing: estimating bag counts, spotting group travel patterns, flagging no-show or skiplag risk, and recommending seat or load adjustments before problems show up at the gate.

**Real systems that solve this problem:** Brock Solutions SmartSuite Enterprise, SITA Horizon DCS, Amadeus Altéa Departure Control. They combine messy operational data, business rules, safety-critical decisions, and operational dashboards. Your version is much smaller, but the underlying ideas are the same.

## The pipeline

1. Load passenger, booking, flight, and aircraft data
2. Passenger starts check-in and identity verification
3. System validates documents, flags anything needing manual review
4. Bags are accepted, tagged, linked to the passenger
5. Bag scans update live baggage state
6. Passenger and baggage weight gets estimated across aircraft zones
7. System recommends seat, bag, or review actions where needed
8. Operational view shows departure readiness

In a real system this runs continuously. For the challenge, focus on making the data flow and the decisions clear rather than handling every edge case.

## How this maps to real systems

| Hackathon concept | Industry analogue |
|---|---|
| Passenger check-in flow | DCS check-in processing |
| ID and document upload | Passport/visa/identity verification |
| Boarding pass generation | Departure control passenger acceptance |
| Bag tag creation | Baggage acceptance and reconciliation |
| QR or mock scan events | Baggage handling system tracking |
| Bag status dashboard | Baggage operations monitoring |
| Predicted bag count | Passenger behavior / load forecasting |
| Seat/load recommendation | Aircraft load control |
| Manual review flags | Agent intervention, exception handling |
| Unified ops dashboard | Departure readiness control |

## Challenge summary

Build a simplified DCS automation module covering one or more of:

1. **Predictive Load Controller (PLC)**
2. **Unified Identity Gateway (UIG)**
3. **IoT Baggage Tracker (IBT)**

A narrow, complete solution in one area is fine. So is combining all three into one workflow.

### 1. Predictive Load Controller

Estimates aircraft load from passenger and baggage data, and recommends seat or weight assignments to keep it balanced.

A basic version uses mock data and simple rules. A stronger version predicts bag counts, group behavior, and risk patterns using ML or scoring logic, based on signals like:

- Passenger weight estimate, bag count, estimated baggage weight
- Group travel patterns, seat assignment, cabin/cargo zone
- Check-in status, historical bag behavior, skiplag/no-show/misconnection tendency

This isn't a certified W&B system — the point is showing how predictive logic improves operational decisions before departure. A strong implementation explains *why* it made a recommendation, not just what the final assignment is. For example: a group seated entirely in the rear cabin creates imbalance; several heavy bags in one cargo zone need redistribution; a passenger predicted to check two bags affects planning before the bags even arrive; a no-show risk lowers confidence in the final load estimate.

### 2. Unified Identity Gateway

Simulates check-in where identity verification, document checks, and boarding pass issuance happen as one flow instead of three separate tools:

- Passenger lookup, ID/passport upload, document validation
- Seat confirmation, bag declaration, bag tag + boarding pass generation
- Passenger marked ready for boarding

The system should clearly show whether a passenger is cleared, blocked, or needs manual review — for reasons like a missing passport number, expired document, name mismatch, extra checks required for the destination, or an overweight bag.

A stronger version adds simulated biometric face-match, a document confidence score, or a rules-based approval flow.

### 3. IoT Baggage Tracker

Simulates real-time bag movement from check-in to loading, using QR codes, mock scan events, or a fake sensor feed:

accepted → tagged → scanned at induction → screened → sorted to flight → staged at gate → loaded → (or: missing/delayed/exception)

The dashboard should answer: *are all accepted bags accounted for, and is anything putting departure at risk?* — showing bag location, the passenger each bag belongs to, and flight readiness.

## Basic vs. advanced

**Basic:** treat the DCS as a deterministic workflow. Load mock data, build check-in, generate boarding passes, accept bags and assign tags, track status, assign seats by zone, estimate load, flag obvious issues (missing docs, overweight bags, unbalanced zones). This gets you a working baseline that rewards clean data modeling and a readable UI.

**Advanced:** treat it as a predictive decision-support system — estimate what's likely to happen and recommend action before all the data is in. ML bag count prediction, group detection, no-show/skiplag scoring, seat reassignment for balance, cargo optimization, document confidence scoring, baggage exception prediction, real-time dashboarding.

## State to track

**Passenger:** ID, name, booking reference, flight, check-in status, seat, group ID, document status, boarding pass status, boarding status, predicted vs. actual bag count, risk flags.

**Baggage:** tag ID, passenger ID, flight ID, current location/status, weight, last scan time, exception status, loaded or not.

**Flight:** ID, aircraft type, seat map, cabin/cargo zones, passenger load, baggage load, estimated CG balance, departure readiness.

## Inputs

Mock data may include passenger lists, bookings, historical passenger behavior, seat maps, aircraft zone layouts, baggage records, scan events, document fields, schedules, boarding events. Expect it to be messy — missing fields, late updates, conflicting bag counts, duplicate names, inconsistent scans.

## Expected outputs

Check-in status, document verification status, boarding pass, seat assignment, predicted vs. actual bag counts, bag status timeline, zone load estimate, balancing recommendations, list of blocked passengers/exceptions, and a departure readiness summary.

## Evaluation

- **Workflow completeness** — realistic check-in to boarding flow?
- **Data modeling** — are passengers, bags, flights, seats, and scans represented clearly?
- **Prediction quality** — are bag count, group, and risk predictions reasonable?
- **Load balancing logic** — are the balance recommendations actually useful?
- **Exception handling** — does it catch missing documents, bag issues, inconsistent records?
- **Dashboard clarity** — can an operator tell at a glance whether the flight is ready?
- **Code quality** — modular, readable, maintainable?
- **Demo quality** — does it make the case for why predictive DCS automation matters?

## Suggested milestones

1. **Mock data and core models** — passenger, flight, aircraft, seat, baggage models from JSON/CSV/a small DB. *Demo: show a passenger list, seat map, and bag list for one flight.*
2. **Basic check-in flow** — confirm passenger, seat, document status, bag count. *Demo: a passenger goes from not-checked-in to checked-in with a boarding pass.*
3. **Baggage status tracking** — scan events move bags through states. *Demo: bags progress through check-in → screening → sorting → loading on a dashboard.*
4. **Load estimation** — weight across cabin/cargo zones. *Demo: show whether the aircraft is balanced or one zone is overloaded.*
5. **Predictive logic** — bag count, group behavior, no-show/skiplag risk from historical/mock data. *Demo: explain why a passenger or group is expected to add load risk.*
6. **Recommendation engine** — seat/bag/zone changes or manual review flags. *Demo: suggest an adjustment and show the resulting improvement.*
7. **Unified dashboard** — passenger, identity, baggage, and load state in one view. *Demo: an operator can see readiness and outstanding issues at a glance.*
8. **Polish** — better test data, edge cases, a clean demo script. *Demo: walk judges through one passenger journey, one bag journey, one load decision.*

## Optional stretch goals

Face-match biometric simulation, passport OCR simulation, QR bag tag generation, real-time event replay, an agent-facing admin view, a passenger-facing check-in page, seat map / cargo hold visualization, comparing ML models for bag prediction, an audit log for overrides.

## Final goal

By the end, your system should answer: *who's ready to fly, where are their bags, is the aircraft balanced, and what could delay departure?*

That's the same question real DCS platforms answer for airlines every day before the aircraft pushes back.
