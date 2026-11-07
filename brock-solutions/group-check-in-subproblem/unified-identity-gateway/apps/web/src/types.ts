export type CheckInStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'CLEARED' | 'BLOCKED' | 'NEEDS_REVIEW';

export interface Flight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  aircraftType: string;
  maxBagWeightKg: number;
}

export interface Seat {
  id: string;
  flightId: string;
  seatNumber: string;
  cabinZone: 'FRONT' | 'MID' | 'REAR';
  occupied: boolean;
  passengerId: string | null;
}

export interface SeatmapSeat extends Seat {
  passenger: { id: string; firstName: string; lastName: string } | null;
}

export interface Document {
  id: string;
  passportNumber: string;
  fullName: string;
  dob: string;
  nationality: string;
  expiryDate: string;
  confidenceScore: number;
  issues: string[];
  status: string;
  faceMatchPassed: boolean;
  faceMatchScore: number | null;
}

export interface Bag {
  id: string;
  tagId: string;
  weightKg: number;
  overweight: boolean;
}

export interface BoardingPass {
  id: string;
  seatNumber: string;
  qrPayload: string;
  issuedAt: string;
}

export interface Passenger {
  id: string;
  bookingRef: string;
  firstName: string;
  lastName: string;
  flightId: string;
  groupId: string | null;
  checkInStatus: CheckInStatus;
  declaredBagCount: number;
  riskFlags: string[];
  flight: Flight;
  seat: Seat | null;
  document: Document | null;
  bags: Bag[];
  boardingPass: BoardingPass | null;
}

export interface AuditLogEntry {
  id: string;
  actorRole: string;
  action: string;
  prevStatus: string;
  newStatus: string;
  reason: string;
  timestamp: string;
}
