# Brock Solutions Airport Innovation Challenge

### Theme: Message-Driven Operations at YYZ

![Aerial view of Toronto Pearson International Airport](images/yyz.jpg)

Created by Engineering IDEAs Clinic co-op students.

## Table of Contents

- [Quick Links](#quick-links)
- [Your Mission](#your-mission)
- [Background Information](#background)
- [Sub-Problems](#sub-problems)
  - [Mishandled Baggage](#mishandled-baggage)
  - [Baggage Handling System](#baggage-handling-system)
  - [Gate Assignment](#gate-assignment)
  - [Group-Check-in](#group-check-in)
  - [Aircraft Loading](#aircraft-loading)
- [Development Approach](#development-approach)
- [Submission](#submission)
- [Judging Criteria](#judging-criteria)
- [General Resources](#general-resources)
- [Schedule and Logistics](#schedule-and-logistics)


## Quick Links

> **Navigation tip:** Use the headings in this document to move quickly between sections. Screen reader users can navigate by heading level.

- [Mishandled Baggage subproblem](mishandled-baggage-subproblem/README.md)
- [Baggage Handling System subproblem](baggage-handling-system-subproblem/README.md)
- [Gate Assignment subproblem](gate-assignment-subproblem/README.md)
- [Group Check-in subproblem](group-check-in-subproblem/README.md)
- [Aircraft Loading subproblem](aircraft-load-subproblem/README.md)
- [Submission expectations](#submission)
- [Judging rubric](#judging-criteria)

> **Fact Disclaimer** All the information in this repo are estimates based on publicly available information. They are provided for illustrative purposes and should not be misconstrued as fact.

## Your Mission

Modern airports rely on connected systems to move passengers, aircraft, baggage, and staff safely and efficiently. Brock Solutions builds and integrates software for these real airport operations.

In this challenge, your team has been invited to prototype a software or software-adjacent solution for an airport automation problem. You may extend the supplied code, combine ideas from several sub-problems, or create a related solution of your own. Your solution should be realistic enough to connect to airport operations, but focused enough to prototype during the challenge.

Toronto Pearson International Airport (YYZ) is the recommended airport for this challenge, but you can build your solution for any airport of your choosing. An airport like Pearson handles about 128,000 passengers daily, and might route routing their luggage through a web of thousands of conveyors. This complicated web of passengers, luggage, flights, gates, need good software to manage. To build good software, think like an airport systems engineer:

- expect incomplete, late, or conflicting data
- consider safety, privacy, accessibility, and operational constraints
- build a simple working version before adding complexity
- explain the decisions and trade-offs behind your design
- show how your idea could connect to a larger airport system

Airport systems are message driven and closely connected. A passenger update in a Departure Control System can affect baggage handling, aircraft readiness, gate planning, and the operational information used by other teams. Your prototype does not need to model the whole airport, but it should understand where it fits.

As you make your solution this weekend, use the [judging criteria](#judging-criteria) to guide your decisions and demonstration.

## Background 

Airlines and airports have suites of software solutions to manage this complicated web of logistics. You can choose to solve your subproblem with these software solutions. Some common software suites are:
### BHS
A Baggage Handling System (BHS) identifies, tracks, routes, and sorts bags through scanners, conveyors, diverters, make-up areas, and carousels. A bad routing decision can delay a passenger, a flight, or an entire baggage pier. 

Examples of Baggage Handling System providers include Vanderlande and Siemens Logistics.
### GMS
A Gate Management System (GMS) assigns arriving and departing aircraft to airport gates. It must account for aircraft size, timing, gate equipment, passenger needs, customs rules, cargo restrictions, and disruptions such as delays or outages. 

Examples of Gate Management Systems include Better Stand & Gate by Copenhagen Optimization and ResourceManager by Assaia. 
### DCS
A Departure Control System (DCS) handles everything that must happen before a passenger, and an aircraft are ready to leave check-in, identity and document checks, baggage acceptance, seat assignment, boarding passes, boarding status, and aircraft load control. 

Examples of Departure Control Systems include Amadeus Altéa and Sabre's departure control solutions.
###
You can check out the software solutions from Brock Solutions here: [https://www.brocksolutions.com/airports-and-airlines/#]

## Sub-Problems
### [Mishandled Baggage](mishandled-baggage-subproblem/README.md)

Bags can become separated from their owners for various reasons. As they move through the baggage handling system the tags can become damaged, losing the passenger/destination information, or they could be missing when loading the plane. Bags could also be swapped by bad actors, with the tag being removed and placed on a different bag. All ways of losing a bag cause distress to the passenger, as they have lost their personal belongings. This, in turn, causes a negative reputation and loss of money for the airlines and airport who handled the baggage.

#### Challenge

Your challenge is to design a system or software to aid in the tracking of bags, to aid in preventing loss and to help return bags to their owners.

![Bag left behind on airport runway](images/mishanddled-bag.webp)

#### Potential Solutions:
* SecureBag - Security against malicious attempts at switching baggage [[Supported]](mishandled-baggage-subproblem/securebag/README.md)
* Privacy-conscious tracking that avoids unnecessary passenger personal information
* Develop system or software to identify bags with damaged/missing tags, and reunite them with their owners

Your solution may be software-only, hardware-assisted, simulation-based, or a mix of all three.

[Open the mishandled baggage challenge](mishandled-baggage-subproblem/README.md).

### [Baggage Handling System](#baggage-handling-system-subproblem/README.md)

To get from check-in to airplane, baggage travels over a large system of conveyors. The bags are taken through hold baggage screening, then must be routed to the correct lateral or chute to be loaded onto the plane. To get the bag to the correct terminal, the conveyor system needs to know where the bag needs to end up, to track where it is, and to move it onto the correct conveyors. It does this for thousands of bags, all at the same time.
In addition to routing the bags, the conveyor system needs to have methods identify irregular luggage that could get stuck or damage the system. The system also needs to be safe for the operators. 

#### Challenge

Your challenge is to design a BHS that can identify, track, route baggage through a simplified baggage handling environment, and detect anomalies or foreign objects on conveyor systems to ensure operational safety.

![Baggage moving through an airport conveyor system](images/conveyor_system.webp)

#### Potential Solutions:
* Control a real conveyor system to simulate bag movement through a network [[Supported]](baggage-handling-system-subproblem/barcode-conveyor/README.md)
* Simulation of bag movement through a simplified baggage handling system [[Supported]](baggage-handling-system-subproblem/bhs-simulation/README.md)
* Error handling for unreadable, oversized, overweight, fragile, or untagged bags
* Foreign object or anomaly detection on conveyor tracks
* Human intrusion detection
* Emergency stop, slowdown, or warning signals for conveyor operations

Your solution may be software-only, hardware-assisted, simulation-based, or a mix of all three.

[Open the Baggage Handling System challenge](baggage-handling-system-subproblem/README.md).

### [Gate Assignment](gate-assignment-subproblem/README.md)

![Example of aircraft being assigned to airport gates](images/gate_assgt.png)

#### The Problem
During a busy weekend at Toronto Pearson Airport an arriving aircraft is forced to wait on the taxiway. Due to slow and inefficient gate assignments, passengers are left stuck waiting on board. This leads to passengers missing connections and appointments. Inside the airport, crowds swell as other flights are also delayed overwhelming staff. Consequently, this leads to both the airline and the airport suffering financial losses and damage to their reputation.  

#### Challenge
Your challenge is to develop a solution that assigns airport gates to arriving and departing flights over time. Your solution must:  
- Respect aircraft-gate compatibility
- Handle airline preferences and security concerns
- Adapt dynamically to delays, outages and emergencies (cascading changes)
- Minimize conflicts, delays and wasted time (optimization) 

#### Potential Solutions:
  * Improve the existing greedy scoring-aware assignment algorithm [Supported](gate-assignment-subproblem/gate-sorting-algorithm/solution_scored.py)
  * Improve the existing operator dashboard / interactive timeline visualizer or create a brand new one from scratch [Supported](gate-assignment-subproblem/gate-sorting-algorithm/visualize.py)
  * Scenario analysis across busy/emergency/cargo/overnight cases [Supported](gate-assignment-subproblem/gate-sorting-algorithm/visualize.py)
  * Create a Live what-if simulator for manual override impact
  * Add an explanation to the Gate Assignments ("why assign gate X for flight Y")
  * Predictive disruption handling from historical delay patterns 
     
#### Starting Point

This is the most structured coding subproblem. You may write your own assignment algorithm or build a larger tool around the supplied baseline.

[Open the Gate Assignment Subproblem](gate-assignment-subproblem/README.md).

### [Group-Check-in](group-check-in-subproblem/README.md)
![Passengers check-in](images/Gty_airport_checkin_er_160415_16x9_992.jpg)
#### The Problem

A school group of 32 passengers arrives at the airport to check in for the same flight less than an hour before the check-in deadline. Although the passengers are travelling together, each person has different document requirements, seat assignments and baggage information. Most passengers complete document verification without issues, but several require additional review.

Processing every passenger individually creates a long queue and increases the risk that the group will not complete check-in on time. However, treating the entire group as one unit could cause individual document or baggage issues to be overlooked. Airline and ground-handling agents need a way to see which passengers are ready, which require attention and what issues remain unresolved.

#### Challenge

Your challenge is to develop a solution that helps airline and ground-handling agents process large group check-ins efficiently while maintaining accurate check-in and document verification information for each individual passenger.

#### Potential Solutions

- Unified identity gateway: booking lookup, document checks, seat selection, baggage declaration, boarding pass issuance, agent review, and audit logging. [Supported](group-check-in-subproblem/unified-identity-gateway/README.md)
- Group check-in status dashboard
- Document-review assistant with mismatch confidence scoring
- Baggage reconciliation linking declared bags to scan events
- Override and audit-log analytics for staff workload and rule-override patterns
- Accessibility-first check-in flow variant

[Open the Group-Check-in Subproblem](group-check-in-subproblem/README.md).

### [Aircraft Loading](aircraft-load-subproblem/README.md)
![Loading cargo at airport](images/faq-air-airplane-cargo-hold-dimensions-v2020-header.webp)
#### The Problem
A mechanical issue causes the airline to replace the originally scheduled aircraft with a smaller aircraft shortly before departure. The new aircraft has different seating, baggage capacity and weight-and-balance-limits. 

Passengers have already checked in, seats have been assigned, and baggage is being prepared for loading. Because the new aircraft has less capacity and different loading constraints, the existing passenger and baggage plan can no longer be used directly. Staff must quickly determine how to recognize passengers, baggage and available capacity while avoiding unnecessary delays. 

#### Challenge
Your challenge is to develop a solution that quickly adapts the existing passenger and baggage plan to the replacement aircraft while maintaining safety weight-and-balance limits and minimizing operational disruption. 

#### Potential Solutions:
  * Aircraft load control (weight/balance zone assignment) [Supported](aircraft-load-subproblem/load-control)
  * Baggage reconciliation linking declared bags to scan events
  * Flight-close readiness aggregator (identity + load + baggage in one score)
  * Override/audit-log analytics for staff workload + rule-override patterns
    
[Open the aircraft-load-subproblem](aircraft-load-subproblem/README.md).

## General Resources

Depending on the subproblem, the repository includes starter code, JSON messages, schedules, airport data, demo scripts, evaluators, simulations, and reference implementations. Do not assume the visible examples cover every case.

The IDEAs Clinic also has a [Tech Resources page](https://github.com/IdeasClinicUWaterloo/TechResources/tree/main), which may have information or resources useful for your solution.

Useful topics and tools include:

- airport systems integration and event-driven software
- optimization, simulation, and visualization
- `numpy`, `pandas`, `matplotlib`, `scipy`, `networkx`, `simpy`, and `pulp`
- Canadian Aviation Security Regulations and Canadian accessibility requirements
- International Air Transport Association (IATA) and International Civil Aviation Organization (ICAO) guidance

You may use other tools when they are appropriate for your solution. Reference external data, libraries, and research clearly in your final documentation.

## Development Approach

1. Choose one clear operational problem.
2. Run or inspect the supplied example before changing it.
3. Build the smallest complete version of your idea.
4. Add validation and handle a few meaningful edge cases.
5. Test the same inputs before and after each change.
6. Add one distinctive feature if time allows.
7. Prepare a short demonstration and explain your trade-offs.

A reliable, understandable prototype is stronger than several unfinished features.

Groups are allowed to use GenAI in the development of their solution, but must submit a disclosure of how it was used.

## Submission & Presentation

Teams will give a short presentation of about 3 to 5 minutes. Include:

- the problem you chose and who it affects
- how your solution works
- the prototype, simulation, dashboard, or hardware demonstration
- the constraints and edge cases you considered
- the result you achieved
- what you would improve with more time

Your presentation may include code, a dashboard, a simulation, a hardware and software demonstration, a design with partial implementation, or a combination of these. 

You will also need to submit your presentation (only one member per group needs to submit), including the name and description of your solution, your presentation slides, and a video of a demonstration (if you have one). If you use GenAI in any stage of your project, you must submit an AI disclosure with your submission. Disclosures should be made using https://aidframework.org/.

## Schedule and Logistics
### Friday, November 6 | 5:00 p.m. – 7:00 p.m.
Orientation and prep session: Explore the problem areas and available tools and begin forming teams.
### Saturday, November 7 | 9:00 a.m. – 5:00 p.m.
Begin developing, testing, and prototyping your solution.
### Sunday, November 8 | 9:00 a.m. – 5:00 p.m.
Continue developing your solution and prepare your final presentation. Judging will begin at approximately 2:30 p.m.
Location: Ideas Clinic, PSE-1427

## Judging Criteria

### Ideation

| Category | What judges are looking for | Score |
| --- | --- | --- |
| Relevance | The solution addresses a meaningful airport problem. | /10 |
| Reasonability | The idea and assumptions are sensible. | /10 |
| Impact | The solution could help its intended users or stakeholders. | /10 |

### Feasibility

| Category | What judges are looking for | Score |
| --- | --- | --- |
| Cost | The cost to build and operate the solution is realistic. | /10 |
| Return on investment | The expected benefit is worth the effort and cost. | /10 |
| Practicality | The solution could fit into a real operational environment. | /10 |
| Reliability | The design considers failures, recovery, and downtime. | /10 |

### Prototype Execution

| Category | What judges are looking for | Score |
| --- | --- | --- |
| Functionality | The prototype works during judging. | /10 |
| Build quality | The implementation or physical prototype is well made. | /10 |

### Safety and Regulations

| Category | What judges are looking for | Score |
| --- | --- | --- |
| Employee and operator safety | The design accounts for risks to workers and users. | /10 |
| Regulatory awareness | The team identifies relevant Canadian or international requirements. | /10 |


### Demo and Presentation

| Category | What judges are looking for | Score |
| --- | --- | --- |
| Clarity | The team explains the problem and solution clearly. | /10 |
| Depth | The team shows meaningful understanding of the problem. | /10 |
| Demo | The demonstration makes the result easy to understand. | /10 |

Coding subproblems may also use hidden test cases to check whether solutions work beyond the visible examples.



