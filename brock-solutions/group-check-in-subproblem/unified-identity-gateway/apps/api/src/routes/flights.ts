import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CabinZone, Prisma } from '@prisma/client';
import { prisma } from '../db';

const isoDateString = z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
  message: 'must be a valid date string',
});

const flightSchema = z.object({
  flightNumber: z.string().min(1),
  origin: z.string().min(1),
  destination: z.string().min(1),
  departureTime: isoDateString,
  aircraftType: z.string().min(1),
  maxBagWeightKg: z.number().positive(),
});

async function makeSeats(tx: Prisma.TransactionClient, flightId: string) {
  const zones: { letters: string[]; zone: CabinZone; rows: number[] }[] = [
    { letters: ['A', 'B', 'C'], zone: 'FRONT', rows: [1, 2, 3] },
    { letters: ['A', 'B', 'C'], zone: 'MID', rows: [10, 11, 12] },
    { letters: ['A', 'B', 'C'], zone: 'REAR', rows: [20, 21, 22] },
  ];
  for (const { letters, zone, rows } of zones) {
    for (const row of rows) {
      for (const letter of letters) {
        await tx.seat.create({ data: { flightId, seatNumber: `${row}${letter}`, cabinZone: zone } });
      }
    }
  }
}

export async function flightRoutes(app: FastifyInstance) {
  app.get('/flights', async () => {
    return prisma.flight.findMany({ orderBy: { departureTime: 'asc' } });
  });

  app.post<{ Body: unknown }>('/flights', async (req, reply) => {
    const parsed = flightSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const flight = await prisma.$transaction(async (tx) => {
      const created = await tx.flight.create({
        data: { ...parsed.data, departureTime: new Date(parsed.data.departureTime) },
      });
      await makeSeats(tx, created.id);
      return created;
    });

    return reply.code(201).send(flight);
  });

  app.get<{ Params: { id: string } }>('/flights/:id/seatmap', async (req, reply) => {
    const flight = await prisma.flight.findUnique({ where: { id: req.params.id } });
    if (!flight) return reply.code(404).send({ error: 'flight_not_found' });

    const seats = await prisma.seat.findMany({
      where: { flightId: req.params.id },
      include: { passenger: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ cabinZone: 'asc' }, { seatNumber: 'asc' }],
    });
    return { flight, seats };
  });
}
