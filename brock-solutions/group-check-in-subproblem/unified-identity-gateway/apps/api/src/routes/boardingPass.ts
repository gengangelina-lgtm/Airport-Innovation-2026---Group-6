import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { prisma } from '../db';
import { determineOverallStatus } from '../rules/status';
import { passengerInclude } from './passengers';

export async function boardingPassRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/passengers/:id/boarding-pass', async (req, reply) => {
    const passenger = await prisma.passenger.findUnique({
      where: { id: req.params.id },
      include: { document: true, seat: true, bags: true, boardingPass: true },
    });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });

    if (passenger.boardingPass) {
      return prisma.passenger.findUnique({
        where: { id: passenger.id },
        include: passengerInclude,
      });
    }

    // An agent override sets checkInStatus straight to CLEARED without touching the
    // underlying document/bag records that caused the original block — so a passenger
    // who was overridden must be allowed through here without re-failing on those same
    // stale flags. Only re-derive from document/bags when the passenger wasn't overridden.
    const wasOverridden = passenger.checkInStatus === 'CLEARED';
    if (!wasOverridden) {
      if (!passenger.document || passenger.document.status !== 'VALID') {
        return reply.code(409).send({ error: 'document_not_cleared' });
      }
      if (passenger.bags.some((b) => b.overweight)) {
        return reply.code(409).send({ error: 'overweight_bag_unresolved' });
      }
    }
    if (!passenger.seat) {
      return reply.code(409).send({ error: 'seat_not_assigned' });
    }

    const id = randomUUID();
    const boardingPass = await prisma.boardingPass.create({
      data: {
        id,
        passengerId: passenger.id,
        flightId: passenger.flightId,
        seatNumber: passenger.seat.seatNumber,
        qrPayload: `UIG-PASS-${id}`,
      },
    });

    const newStatus = determineOverallStatus({
      documentStatus: 'VALID',
      anyBagOverweight: false,
      boardingPassIssued: true,
    });

    return prisma.passenger.update({
      where: { id: passenger.id },
      data: { checkInStatus: newStatus },
      include: passengerInclude,
    });
  });
}
