import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server';
import { prisma } from '../src/db';

describe('UIG API smoke test', () => {
  const app = buildServer();
  let flightId: string;
  let passengerId: string;
  let passengerId2: string;
  let passengerId3: string;
  let seatId: string;

  beforeAll(async () => {
    await app.ready();
    const flight = await prisma.flight.create({
      data: {
        flightNumber: 'TST001',
        origin: 'JFK',
        destination: 'LHR',
        departureTime: new Date('2030-01-01T00:00:00.000Z'),
        aircraftType: 'A320',
        maxBagWeightKg: 23,
      },
    });
    flightId = flight.id;
    const seat = await prisma.seat.create({
      data: { flightId, seatNumber: '1A', cabinZone: 'FRONT' },
    });
    seatId = seat.id;
    const passenger = await prisma.passenger.create({
      data: { bookingRef: 'SMOKE1', firstName: 'Test', lastName: 'Smoke', flightId },
    });
    passengerId = passenger.id;
    const passenger2 = await prisma.passenger.create({
      data: { bookingRef: 'SMOKE2', firstName: 'Test', lastName: 'Smoke2', flightId },
    });
    passengerId2 = passenger2.id;
    const passenger3 = await prisma.passenger.create({
      data: { bookingRef: 'SMOKE3', firstName: 'Test', lastName: 'Smoke3', flightId },
    });
    passengerId3 = passenger3.id;
  });

  afterAll(async () => {
    const allIds = [passengerId, passengerId2, passengerId3];
    await prisma.auditLog.deleteMany({ where: { passengerId: { in: allIds } } });
    await prisma.boardingPass.deleteMany({ where: { passengerId: { in: allIds } } });
    await prisma.bag.deleteMany({ where: { passengerId: { in: allIds } } });
    await prisma.document.deleteMany({ where: { passengerId: { in: allIds } } });
    await prisma.seat.deleteMany({ where: { flightId } });
    await prisma.passenger.deleteMany({ where: { flightId } });
    await prisma.flight.deleteMany({ where: { id: flightId } });
    await app.close();
    await prisma.$disconnect();
  });

  it('clears a clean passenger end to end', async () => {
    const docRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId}/document`,
      payload: {
        passportNumber: 'A1234567',
        fullName: 'Test Smoke',
        dob: '1990-01-01',
        nationality: 'US',
        expiryDate: '2035-01-01',
        faceMatchPassed: true,
        faceMatchScore: 0.32,
      },
    });
    expect(docRes.statusCode).toBe(200);
    expect(docRes.json().checkInStatus).toBe('IN_PROGRESS');

    const seatRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId}/seat`,
      payload: { seatId },
    });
    expect(seatRes.statusCode).toBe(200);

    const bagRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId}/bags`,
      payload: { bags: [{ weightKg: 18 }] },
    });
    expect(bagRes.statusCode).toBe(200);
    expect(bagRes.json().checkInStatus).toBe('IN_PROGRESS');

    const passRes = await app.inject({ method: 'POST', url: `/passengers/${passengerId}/boarding-pass` });
    expect(passRes.statusCode).toBe(200);
    expect(passRes.json().checkInStatus).toBe('CLEARED');
  });

  it('keeps CLEARED durable after boarding-pass issuance, even if document is resubmitted with issues', async () => {
    const docRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId}/document`,
      payload: {
        passportNumber: '',
        fullName: 'Test Smoke',
        dob: '1990-01-01',
        nationality: 'US',
        expiryDate: '2035-01-01',
        faceMatchPassed: true,
        faceMatchScore: 0.32,
      },
    });
    expect(docRes.json().checkInStatus).toBe('CLEARED');
    expect(docRes.json().document.issues).toContain('missing_or_invalid_passport_number');

    const overrideRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId}/override`,
      payload: { reason: 'test' },
    });
    expect(overrideRes.statusCode).toBe(409);
    expect(overrideRes.json().error).toBe('override_not_applicable');
  });

  it('blocks then overrides a fresh passenger with a bad passport', async () => {
    const docRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId2}/document`,
      payload: {
        passportNumber: '',
        fullName: 'Test Smoke2',
        dob: '1990-01-01',
        nationality: 'US',
        expiryDate: '2035-01-01',
        faceMatchPassed: true,
        faceMatchScore: 0.32,
      },
    });
    expect(docRes.json().checkInStatus).toBe('BLOCKED');
    expect(docRes.json().document.issues).toContain('missing_or_invalid_passport_number');

    const overrideRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId2}/override`,
      payload: { reason: 'Verified manually against printed passport' },
    });
    expect(overrideRes.statusCode).toBe(200);
    expect(overrideRes.json().checkInStatus).toBe('CLEARED');

    const auditRes = await app.inject({ method: 'GET', url: `/passengers/${passengerId2}/audit-log` });
    expect(auditRes.json()).toHaveLength(1);
  });

  it('blocks a passenger with an otherwise-clean document when face match fails', async () => {
    const docRes = await app.inject({
      method: 'POST',
      url: `/passengers/${passengerId3}/document`,
      payload: {
        passportNumber: 'A1234567',
        fullName: 'Test Smoke3',
        dob: '1990-01-01',
        nationality: 'US',
        expiryDate: '2035-01-01',
        faceMatchPassed: false,
        faceMatchScore: 0.91,
      },
    });
    expect(docRes.statusCode).toBe(200);
    expect(docRes.json().checkInStatus).toBe('BLOCKED');
    expect(docRes.json().document.issues).toContain('face_match_failed');
  });

  it('lists flights including the throwaway test flight', async () => {
    const res = await app.inject({ method: 'GET', url: '/flights' });
    expect(res.statusCode).toBe(200);
    const flights = res.json();
    expect(Array.isArray(flights)).toBe(true);
    expect(flights.some((f: { id: string }) => f.id === flightId)).toBe(true);
  });

  it('returns a seatmap with the assigned passenger nested on their seat', async () => {
    const res = await app.inject({ method: 'GET', url: `/flights/${flightId}/seatmap` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.flight.id).toBe(flightId);
    const assignedSeat = body.seats.find((s: { id: string }) => s.id === seatId);
    expect(assignedSeat.passenger.id).toBe(passengerId);
  });
});
