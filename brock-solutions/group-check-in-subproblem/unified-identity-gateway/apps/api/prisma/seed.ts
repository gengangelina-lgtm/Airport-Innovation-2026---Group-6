import { PrismaClient, CabinZone, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function makeSeats(tx: Prisma.TransactionClient, flightId: string) {
  const zones: { letters: string[]; zone: CabinZone; rows: number[] }[] = [
    { letters: ['A', 'B', 'C'], zone: 'FRONT', rows: [1, 2, 3] },
    { letters: ['A', 'B', 'C'], zone: 'MID', rows: [10, 11, 12] },
    { letters: ['A', 'B', 'C'], zone: 'REAR', rows: [20, 21, 22] },
  ];
  for (const { letters, zone, rows } of zones) {
    for (const row of rows) {
      for (const letter of letters) {
        await tx.seat.create({
          data: { flightId, seatNumber: `${row}${letter}`, cabinZone: zone },
        });
      }
    }
  }
}

async function main() {
  let result: { flight1: string; flight2: string };

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany();
    await tx.boardingPass.deleteMany();
    await tx.bag.deleteMany();
    await tx.document.deleteMany();
    await tx.seat.deleteMany();
    await tx.passenger.deleteMany();
    await tx.flight.deleteMany();

    const flight1 = await tx.flight.create({
      data: {
        flightNumber: 'DC101',
        origin: 'JFK',
        destination: 'LHR',
        departureTime: new Date('2026-08-01T10:00:00.000Z'),
        aircraftType: 'A320',
        maxBagWeightKg: 23,
      },
    });

    const flight2 = await tx.flight.create({
      data: {
        flightNumber: 'DC202',
        origin: 'JFK',
        destination: 'DXB',
        departureTime: new Date('2026-08-02T14:00:00.000Z'),
        aircraftType: 'B777',
        maxBagWeightKg: 23,
      },
    });

    await makeSeats(tx, flight1.id);
    await makeSeats(tx, flight2.id);

    await tx.passenger.create({
      data: { bookingRef: 'CLEAN1', firstName: 'Jane', lastName: 'Doe', flightId: flight1.id },
    });
    await tx.passenger.create({
      data: { bookingRef: 'NOPASS', firstName: 'Marcus', lastName: 'Lee', flightId: flight1.id },
    });
    await tx.passenger.create({
      data: { bookingRef: 'EXPIRD', firstName: 'Aisha', lastName: 'Khan', flightId: flight1.id },
    });
    await tx.passenger.create({
      data: { bookingRef: 'NAMEMM', firstName: 'Robert', lastName: 'Smith', flightId: flight1.id },
    });
    await tx.passenger.create({
      data: { bookingRef: 'XCHECK', firstName: 'Wei', lastName: 'Chen', flightId: flight2.id },
    });
    await tx.passenger.create({
      data: { bookingRef: 'OVRWGT', firstName: 'Priya', lastName: 'Patel', flightId: flight1.id },
    });
    const groupId = 'GRP-FAMILY-1';
    await tx.passenger.create({
      data: { bookingRef: 'GROUP1', firstName: 'Tom', lastName: 'Nguyen', flightId: flight1.id, groupId },
    });
    await tx.passenger.create({
      data: { bookingRef: 'GROUP2', firstName: 'Lily', lastName: 'Nguyen', flightId: flight1.id, groupId },
    });

    result = { flight1: flight1.id, flight2: flight2.id };
  });

  console.log('Seed complete:', result!);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
