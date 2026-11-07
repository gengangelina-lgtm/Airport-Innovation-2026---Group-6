import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';

export const passengerInclude = {
  flight: true,
  seat: true,
  document: true,
  bags: true,
  boardingPass: true,
} as const;

const passengerSchema = z.object({
  bookingRef: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  flightId: z.string().min(1),
  groupId: z.string().min(1).optional(),
});

export async function passengerRoutes(app: FastifyInstance) {
  app.post<{ Body: unknown }>('/passengers', async (req, reply) => {
    const parsed = passengerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const flight = await prisma.flight.findUnique({ where: { id: parsed.data.flightId } });
    if (!flight) return reply.code(400).send({ error: 'flight_not_found' });

    const existing = await prisma.passenger.findUnique({ where: { bookingRef: parsed.data.bookingRef } });
    if (existing) return reply.code(409).send({ error: 'booking_ref_taken' });

    const passenger = await prisma.passenger.create({
      data: parsed.data,
      include: passengerInclude,
    });
    return reply.code(201).send(passenger);
  });

  app.get<{ Querystring: { flightId?: string } }>('/passengers', async (req) => {
    return prisma.passenger.findMany({
      where: req.query.flightId ? { flightId: req.query.flightId } : undefined,
      include: passengerInclude,
      orderBy: [{ lastName: 'asc' }],
    });
  });

  app.get<{ Querystring: { bookingRef?: string; lastName?: string } }>('/passengers/lookup', async (req, reply) => {
    const { bookingRef, lastName } = req.query;
    if (!bookingRef || !lastName) {
      return reply.code(400).send({ error: 'bookingRef_and_lastName_required' });
    }
    const passenger = await prisma.passenger.findFirst({
      where: { bookingRef, lastName: { equals: lastName, mode: 'insensitive' } },
      include: passengerInclude,
    });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });
    return passenger;
  });

  app.get<{ Params: { id: string } }>('/passengers/:id', async (req, reply) => {
    const passenger = await prisma.passenger.findUnique({
      where: { id: req.params.id },
      include: passengerInclude,
    });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });
    return passenger;
  });
}
