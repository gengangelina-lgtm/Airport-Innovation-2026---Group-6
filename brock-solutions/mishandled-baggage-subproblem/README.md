# Mishandled Baggage Subproblem
## Table of Contents

- [The Problem](#the-problem)
- [The Challenge](#the-challenge)
- [Potential Solutions](#potential-solutions)
- [Resources](#resources)

## The Problem

Bags can become separated from their owners for various reasons. Bag tags could become damaged or come off, becoming unidentifyable. Bags could get missrouted or missed when loading the plane. Most cases of separated bags are due to accidents or human error, but in some case bags could also be swapped by bad actors, with the tag being removed and placed on a different bag. 
All ways of losing a bag cause distress to the passenger, as they have lost their personal belongings. This will cause a loss of reputation for the airport and airline, and loss of revenue.

## The Challenge

Your challenge is to design a system or software to aid in the tracking of bags, to aid in preventing loss and to help return bags to their owners.

## Potential Solutions

The ideas below are examples to help teams explore possible directions. They are not the only possible solutions.

Teams are encouraged to combine ideas, explore new approaches, and develop creative solutions. 

| Potential solution | Description | Resources |
| --- | --- | --- | 
| SecureBag Software [Supported] | Baggage tracking & security against malicious attempts at switching baggage | [`SecureBag`](securebag/) |
| Baggage Identification & Reconciliation | Develop system or software to identify bags with lost/missing tags, and reunite them with their owners |
| Privacy-conscious tracking | Privacy-conscious tracking that avoids unnecessary passenger personal information | 

Your solution may be software-only, hardware-assisted, simulation-based, research and system development, or a combination. 

The SecureBag starting point was developed for security against baggage swapping, but you may use the provided code for any solution you develop if you find it useful.

## Resources

### Industry Solutions

- [Brock Solutions SmartBag](https://www.brocksolutions.com/smartbag-lite-brs-made-simple/): A comprehensive Baggage Reconciliation System (BRS) for airports, airlines, and ground handlers.
- [Sita WorldTracer](https://www.sita.aero/solutions/sita-at-airports/sita-baggage-management/worldtracer/): An AI-based platform that helps airports manage items lost or separated from passengers.

### Background Information

- **IATA Baggage Standards:** [Resolutions & Recommended Practices (e.g., Resolution 753 on tracking and Resolution 739 on security control)](https://www.iata.org/en/programs/ops-infra/baggage/standards/)
- **IATA Baggage Reference Manual (BRM):** [Consolidated industry operational guidelines and best practices](https://www.iata.org/en/publications/manuals/baggage-reference-manual/)
- **ACI World:** [Airport Operations & Terminal Processing Context](https://aci.aero/)
- **ICAO Publications:** [Global Standards for Secure & Interoperable Aviation Systems](https://www.icao.int/publications)

### Technical Resources

- **IATA Technical Peripheral Specifications (ITPS):** [Standard Device Communications for Printers, Self-Bag Drop, and Hardware](https://www.iata.org/en/publications/manuals/iata-technical-peripheral-specifications/)
- **IATA Baggage Information eXchange (BIX):** [Data Exchange & Interoperability Standards for Tracking](https://www.iata.org/en/programs/ops-infra/baggage/baggage-information-exchange-bix/)

### Data Sources

- **SecureBag Verification Dataset:** Sample images and bag metadata in [`securebag/sample_img/`](securebag/sample_img/) and [`securebag/bags.json`](securebag/bags.json)


  
