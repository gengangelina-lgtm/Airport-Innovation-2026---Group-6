# Aircraft Load Subproblem
## Table of Contents

- [The Problem](#the-problem)
- [The Challenge](#the-challenge)
- [Potential Solutions](#potential-solutions)
- [Resources](#resources)

## The Problem
A mechanical issue causes an equipment change, requiring the airline to replace the originally scheduled aircraft with a smaller aircraft shortly before departure. The new aircraft has different seating, baggage capacity and weight-and-balance limits.

Passengers have already checked in, seats have been assigned, and baggage is being prepared for loading. Because the new aircraft has less capacity and different loading constraints, the existing passenger and baggage plan can no longer be used directly. Airline and ground-handling staff must assess how passenger seating affects the replacement aircraft's weight and balance while adjusting baggage and cargo loading to meet the new constraints. Any necessary passenger reseating or boarding decisions are handled separately by the airline through its Departure Control System (DCS). Checked baggage belonging to passengers who are removed from the flight must also be removed, and a new load plan must be issued.
## The Challenge
Your challenge is to develop a solution that quickly evaluates the passenger and baggage load for the replacement aircraft, optimizes baggage and cargo distribution, and maintains safe weight-and-balance limits while minimizing operational disruption.  

To do this, you can either create your own solution or build off and improve the existing aircraft load control program. 

## Potential Solutions

A possible scope below. You can extend one or build something else entirely.

| Potential solution | Description | Starting point |
| --- | --- | --- |
| Aircraft load control | Calculate passenger weight distribution based on assigned seats and optimize baggage and cargo placement while respecting weight-and-balance limits. | [`load-control/`](load-control/) |
| Aircraft-swap replanning tool | Update the load plan after an equipment change, accounting for revised passenger seating, baggage requirements, and cargo constraints. | 
| Weight-and-balance dashboard | Show aircraft loading, zone weights, limits, and potential violations. |
| Load-plan optimization tool | Find a safe baggage and cargo loading arrangement while minimizing operational disruptions. |

## Resources

### Industry Solutions

- [Brock Solutions SmartLoad](https://www.brocksolutions.com/smartload/): A ramp loading and load-verification solution that verifies actual aircraft loading against the planned load.
- [JetBlue SmartLoad Case Study](https://www.brocksolutions.com/jetblue-is-loading-their-aircrafts-smarter-with-help-from-brock-solutions-and-smartload/): An example of how an airline uses automated loading verification and real-time weight-and-balance information.

### Technical References

- [SKYbrary – Loading Aircraft with Cargo](https://skybrary.aero/articles/loading-aircraft-cargo): Background information on aircraft cargo loading and operational safety.
- [FAA – Weight and Balance Handbook](https://www.faa.gov/sites/faa.gov/files/2023-09/Weight_Balance_Handbook.pdf): Explains aircraft weight limits, centre of gravity, and safe loading calculations.
- [FAA – Aircraft Weight and Balance Control](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1035868?pubDate=20260114): Guidance on aircraft weight-and-balance control programs.
- [FAA – Pilot's Handbook, Chapter 10: Weight and Balance](https://www.faa.gov/regulationspolicies/handbooksmanuals/aviation/phak/chapter-10-weight-and-balance): An introductory explanation of aircraft loading, weight distribution, and balance.

