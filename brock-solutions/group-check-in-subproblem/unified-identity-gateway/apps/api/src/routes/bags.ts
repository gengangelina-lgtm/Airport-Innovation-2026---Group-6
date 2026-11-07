import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { isBagOverweight, determineOverallStatus } from '../rules/status';
import { passengerInclude } from './passengers';

const bagsSchema = z.object({ bags: z.array(z.object({ weightKg: z.number().positive() })) });

export async function bagRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: unknown }>('/passengers/:id/bags', async (req, reply) => {
    const parsed = bagsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });

    const passenger = await prisma.passenger.findUnique({
      where: { id: req.params.id },
      include: { flight: true, document: true, boardingPass: true },
    });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });

    await prisma.bag.deleteMany({ where: { passengerId: passenger.id } });

    for (const bag of parsed.data.bags) {
      const overweight = isBagOverweight(bag.weightKg, passenger.flight.maxBagWeightKg);
      await prisma.bag.create({
        data: {
          passengerId: passenger.id,
          flightId: passenger.flightId,
          tagId: `BAG-${randomUUID().slice(0, 8).toUpperCase()}`,
          weightKg: bag.weightKg,
          overweight,
        },
      });
    }

    const bags = await prisma.bag.findMany({ where: { passengerId: passenger.id } });
    const anyBagOverweight = bags.some((b) => b.overweight);

    const newStatus = determineOverallStatus({
      documentStatus: (passenger.document?.status as 'VALID' | 'BLOCKED' | 'NEEDS_REVIEW' | undefined) ?? null,
      anyBagOverweight,
      boardingPassIssued: passenger.boardingPass !== null,
    });

    return prisma.passenger.update({
      where: { id: passenger.id },
      data: {
        checkInStatus: newStatus,
        declaredBagCount: bags.length,
        riskFlags: anyBagOverweight ? ['overweight_bag'] : [],
      },
      include: passengerInclude,
    });
  });
}
