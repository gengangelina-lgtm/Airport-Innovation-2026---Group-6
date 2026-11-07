# Group-Check-in Subproblem

## Table of Contents
- [The Problem](#the-problem)
- [The Challenge](#the-challenge)
- [Potential Solutions](#potential-solutions)
- [Resources](#resources)

## The Problem
A school group of 32 passengers arrives at the airport to check in for the same flight less than an hour before the check-in deadline. Although the passengers are travelling together, each person has different document requirements, seat assignments and baggage information. Most passengers complete document verification without issues, but several require additional review.

Processing every passenger individually creates a long queue and increases the risk that the group will not complete check-in on time. However, treating the entire group as one unit could cause individual document or baggage issues to be overlooked. Airline and ground-handling agents need a way to see which passengers are ready, which require attention and what issues remain unresolved.

## The Challenge
Your challenge is to develop a solution that helps airline and ground-handling agents process large group check-ins efficiently while maintaining accurate check-in and document verification information for each individual passenger. The solution should help staff identify who is ready, who requires additional review, and what issues still need to be resolved.

### Inputs and Expected Outputs 
You'll likely be working with passenger lists, bookings, document information, seat assignments, baggage records, check-in status, and schedules. As it is difficult to find perfect datasets, some of it will be missing, late, or contradictory. Design for that instead of around it.

Whatever you build should make passenger check-in and document verification status easy to understand at a glance: who is ready, who requires attention, what issues remain unresolved, and why.

## Potential Solutions
A few possible scopes below. You can extend one or build something else entirely.

| Potential solution | Description | Starting point |
| --- | --- | --- |
| Unified identity gateway | Combine booking lookup, document checks, seat selection, baggage declaration, boarding passes, and agent review. | [Working implementation](unified-identity-gateway/README.md) |
| Document-review assistant | Validate required fields, identify mismatches, and route uncertain cases to an agent. | [Identity-gateway rules](unified-identity-gateway/apps/api/src/rules/) |
| Group-Check-in dashboard | Show which passengers are ready, blocked, or awaiting review. | [Unified Identity Gateway](unified-identity-gateway/README.md) |
| Group check-in workflow assistant | Prioritize passengers requiring additional review and help agents resolve outstanding issues before the check-in deadline. |

## Resources
### Challenge Resources

- [Unified Identity Gateway implementation](https://github.com/n4morin/F26-Airport-Automation-Challenge-Updates/blob/main/group-check-in-subproblem/unified-identity-gateway/README.md): An existing implementation for passenger identity and document verification, check-in status tracking, and agent review.

### Industry Solutions

- [Brock Solutions Passenger Monitoring & Processing](https://www.brocksolutions.com/passenger-monitoring-processing/): An industry solution for passenger verification, boarding pass validation, and real-time passenger monitoring.

### Safety, Privacy, and Industry References

- [IATA One ID](https://www.iata.org/en/programs/passenger/one-id/): An industry initiative for digital identity verification, automated document checks, and seamless passenger processing.
- [IATA Common Use Standards](https://www.iata.org/en/programs/passenger/common-use/): Standards supporting airport check-in, boarding, and shared passenger processing systems.
- [ICAO Traveller Identification Programme](https://www.icao.int/icao-trip): A framework for secure and efficient traveller identification.
- [ICAO Annex 9: Facilitation](https://www.icao.int/facilitation-programmes/Annex9): International passenger, border, and document-control context.
- [Canadian Aviation Security Regulations, 2012](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2011-318/index.html)
- [Secure Air Travel Regulations](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2015-181/FullText.html)
- [Personal Information Protection and Electronic Documents Act](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/index.html)
- [Accessible Transportation for Persons with Disabilities Regulations](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2019-244/index.html)
