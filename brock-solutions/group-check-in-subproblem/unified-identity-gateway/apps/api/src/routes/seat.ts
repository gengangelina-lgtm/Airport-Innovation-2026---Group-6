import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { passengerInclude } from './passengers';

const seatSchema = z.object({ seatId: z.string() });

export async function seatRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: unknown }>('/passengers/:id/seat', async (req, reply) => {
    const parsed = seatSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const passenger = await prisma.passenger.findUnique({
      where: { id: req.params.id },
      include: { seat: true, boardingPass: true },
    });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });
    if (passenger.boardingPass) return reply.code(409).send({ error: 'boarding_pass_already_issued' });

    const seat = await prisma.seat.findUnique({ where: { id: parsed.data.seatId } });
    if (!seat || seat.flightId !== passenger.flightId) {
      return reply.code(400).send({ error: 'seat_not_on_flight' });
    }

    if (passenger.seat?.id && passenger.seat.id !== seat.id) {
      await prisma.seat.update({ where: { id: passenger.seat.id }, data: { occupied: false, passengerId: null } });
    }

    const claim = await prisma.seat.updateMany({
      where: { id: seat.id, OR: [{ occupied: false }, { passengerId: passenger.id }] },
      data: { occupied: true, passengerId: passenger.id },
    });
    if (claim.count === 0) {
      return reply.code(409).send({ error: 'seat_occupied' });
    }

    return prisma.passenger.findUnique({
      where: { id: passenger.id },
      include: passengerInclude,
    });
  });
}
