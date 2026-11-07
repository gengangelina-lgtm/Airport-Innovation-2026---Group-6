import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { validateDocument } from '../rules/validateDocument';
import { determineOverallStatus } from '../rules/status';
import { passengerInclude } from './passengers';

const EXTRA_CHECK_DESTINATIONS = ['DXB', 'PEK'];

const isoDateString = z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
  message: 'must be a valid date string',
});

const documentSchema = z.object({
  passportNumber: z.string(),
  fullName: z.string(),
  dob: isoDateString,
  nationality: z.string(),
  expiryDate: isoDateString,
  faceMatchPassed: z.boolean(),
  faceMatchScore: z.number().nullable(),
});

export async function documentRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: unknown }>('/passengers/:id/document', async (req, reply) => {
    const parsed = documentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });

    const passenger = await prisma.passenger.findUnique({
      where: { id: req.params.id },
      include: { flight: true, bags: true, boardingPass: true },
    });
    if (!passenger) return reply.code(404).send({ error: 'passenger_not_found' });

    const result = validateDocument(
      parsed.data,
      `${passenger.firstName} ${passenger.lastName}`,
      passenger.flight.destination,
      passenger.flight.departureTime.toISOString(),
      EXTRA_CHECK_DESTINATIONS,
      parsed.data.faceMatchPassed
    );

    await prisma.document.upsert({
      where: { passengerId: passenger.id },
      create: {
        passengerId: passenger.id,
        passportNumber: parsed.data.passportNumber,
        fullName: parsed.data.fullName,
        dob: new Date(parsed.data.dob),
        nationality: parsed.data.nationality,
        expiryDate: new Date(parsed.data.expiryDate),
        confidenceScore: result.confidenceScore,
        issues: result.issues,
        status: result.status,
        faceMatchPassed: parsed.data.faceMatchPassed,
        faceMatchScore: parsed.data.faceMatchScore,
      },
      update: {
        passportNumber: parsed.data.passportNumber,
        fullName: parsed.data.fullName,
        dob: new Date(parsed.data.dob),
        nationality: parsed.data.nationality,
        expiryDate: new Date(parsed.data.expiryDate),
        confidenceScore: result.confidenceScore,
        issues: result.issues,
        status: result.status,
        faceMatchPassed: parsed.data.faceMatchPassed,
        faceMatchScore: parsed.data.faceMatchScore,
      },
    });

    const anyBagOverweight = passenger.bags.some((b) => b.overweight);
    const newStatus = determineOverallStatus({
      documentStatus: result.status,
      anyBagOverweight,
      boardingPassIssued: passenger.boardingPass !== null,
    });

    const updated = await prisma.passenger.update({
      where: { id: passenger.id },
      data: { checkInStatus: newStatus },
      include: passengerInclude,
    });

    return updated;
  });
}
