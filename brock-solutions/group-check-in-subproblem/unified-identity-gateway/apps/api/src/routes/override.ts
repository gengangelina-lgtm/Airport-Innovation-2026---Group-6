import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { passengerInclude } from './passengers';

const overrideSchema = z.object({ reason: z.string().min(3) });

export async function overrideRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: unknown }>('/passengers/:id/override', async (req, reply) => {
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'reason_required' });

    const passenger = await prisma.passenger.findUnique({ where: { id: req.params.id } });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });

    if (passenger.checkInStatus !== 'BLOCKED' && passenger.checkInStatus !== 'NEEDS_REVIEW') {
      return reply.code(409).send({ error: 'override_not_applicable' });
    }

    await prisma.auditLog.create({
      data: {
        passengerId: passenger.id,
        actorRole: 'AGENT',
        action: 'OVERRIDE_TO_CLEARED',
        prevStatus: passenger.checkInStatus,
        newStatus: 'CLEARED',
        reason: parsed.data.reason,
      },
    });

    return prisma.passenger.update({
      where: { id: passenger.id },
      data: { checkInStatus: 'CLEARED' },
      include: passengerInclude,
    });
  });

  app.get<{ Params: { id: string } }>('/passengers/:id/audit-log', async (req, reply) => {
    const passenger = await prisma.passenger.findUnique({ where: { id: req.params.id } });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });

    return prisma.auditLog.findMany({
      where: { passengerId: req.params.id },
      orderBy: { timestamp: 'desc' },
    });
  });
}
