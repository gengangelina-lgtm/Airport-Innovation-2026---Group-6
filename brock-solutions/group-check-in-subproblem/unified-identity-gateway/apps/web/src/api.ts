import type { AuditLogEntry, Flight, Passenger, SeatmapSeat } from './types';

export class ApiError extends Error {
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
  }
}

export function formatApiError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) return err.message.replace(/_/g, ' ');
  if (err instanceof Error) return err.message;
  return fallback;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(body.error ?? `request_failed_${res.status}`, body.details);
  return body as T;
}

export const api = {
  listFlights: () => request<Flight[]>('/flights'),
  createFlight: (flight: {
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string;
    aircraftType: string;
    maxBagWeightKg: number;
  }) => request<Flight>('/flights', { method: 'POST', body: JSON.stringify(flight) }),
  createPassenger: (passenger: { bookingRef: string; firstName: string; lastName: string; flightId: string; groupId?: string }) =>
    request<Passenger>('/passengers', { method: 'POST', body: JSON.stringify(passenger) }),
  getSeatmap: (flightId: string) => request<{ flight: Flight; seats: SeatmapSeat[] }>(`/flights/${flightId}/seatmap`),
  listPassengers: (flightId: string) => request<Passenger[]>(`/passengers?flightId=${flightId}`),
  lookupPassenger: (bookingRef: string, lastName: string) =>
    request<Passenger>(`/passengers/lookup?bookingRef=${encodeURIComponent(bookingRef)}&lastName=${encodeURIComponent(lastName)}`),
  getPassenger: (id: string) => request<Passenger>(`/passengers/${id}`),
  submitDocument: (
    id: string,
    doc: {
      passportNumber: string;
      fullName: string;
      dob: string;
      nationality: string;
      expiryDate: string;
      faceMatchPassed: boolean;
      faceMatchScore: number | null;
    }
  ) => request<Passenger>(`/passengers/${id}/document`, { method: 'POST', body: JSON.stringify(doc) }),
  confirmSeat: (id: string, seatId: string) =>
    request<Passenger>(`/passengers/${id}/seat`, { method: 'POST', body: JSON.stringify({ seatId }) }),
  declareBags: (id: string, bags: { weightKg: number }[]) =>
    request<Passenger>(`/passengers/${id}/bags`, { method: 'POST', body: JSON.stringify({ bags }) }),
  issueBoardingPass: (id: string) =>
    request<Passenger>(`/passengers/${id}/boarding-pass`, { method: 'POST' }),
  override: (id: string, reason: string) =>
    request<Passenger>(`/passengers/${id}/override`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getAuditLog: (id: string) => request<AuditLogEntry[]>(`/passengers/${id}/audit-log`),
};
