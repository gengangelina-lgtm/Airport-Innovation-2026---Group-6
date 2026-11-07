import { useEffect, useState } from 'react';
import { api, formatApiError } from '../api';
import type { Flight } from '../types';

const emptyFlight = {
  flightNumber: '',
  origin: '',
  destination: '',
  departureTime: '',
  aircraftType: '',
  maxBagWeightKg: 23,
};

const emptyPassenger = { bookingRef: '', firstName: '', lastName: '', flightId: '', groupId: '' };

export function AdminView() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [flightForm, setFlightForm] = useState(emptyFlight);
  const [flightSaved, setFlightSaved] = useState(false);

  const [passengerForm, setPassengerForm] = useState(emptyPassenger);
  const [passengerSaved, setPassengerSaved] = useState<string | null>(null);

  function loadFlights() {
    api.listFlights().then(setFlights).catch((err) => setError(formatApiError(err)));
  }

  useEffect(loadFlights, []);

  async function submitFlight(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFlightSaved(false);
    try {
      const created = await api.createFlight({
        ...flightForm,
        maxBagWeightKg: Number(flightForm.maxBagWeightKg),
        departureTime: new Date(flightForm.departureTime).toISOString(),
      });
      setFlights((prev) => [...prev, created].sort((a, b) => a.departureTime.localeCompare(b.departureTime)));
      setFlightForm(emptyFlight);
      setFlightSaved(true);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function submitPassenger(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPassengerSaved(null);
    try {
      const created = await api.createPassenger({
        ...passengerForm,
        groupId: passengerForm.groupId || undefined,
      });
      setPassengerForm({ ...emptyPassenger, flightId: passengerForm.flightId });
      setPassengerSaved(created.bookingRef);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <div>
      {error && <p className="issue-list">{error}</p>}

      <div className="card">
        <h2>Add flight</h2>
        <form className="step" onSubmit={submitFlight}>
          <label htmlFor="flightNumber">Flight number</label>
          <input
            id="flightNumber"
            placeholder="e.g. DC303"
            value={flightForm.flightNumber}
            onChange={(e) => setFlightForm({ ...flightForm, flightNumber: e.target.value })}
          />

          <label htmlFor="origin">Origin</label>
          <input
            id="origin"
            placeholder="e.g. JFK"
            value={flightForm.origin}
            onChange={(e) => setFlightForm({ ...flightForm, origin: e.target.value })}
          />

          <label htmlFor="destination">Destination</label>
          <input
            id="destination"
            placeholder="e.g. LHR"
            value={flightForm.destination}
            onChange={(e) => setFlightForm({ ...flightForm, destination: e.target.value })}
          />

          <label htmlFor="departureTime">Departure time</label>
          <input
            id="departureTime"
            type="datetime-local"
            value={flightForm.departureTime}
            onChange={(e) => setFlightForm({ ...flightForm, departureTime: e.target.value })}
          />

          <label htmlFor="aircraftType">Aircraft type</label>
          <input
            id="aircraftType"
            placeholder="e.g. A320"
            value={flightForm.aircraftType}
            onChange={(e) => setFlightForm({ ...flightForm, aircraftType: e.target.value })}
          />

          <label htmlFor="maxBagWeightKg">Max bag weight (kg)</label>
          <input
            id="maxBagWeightKg"
            type="number"
            min={1}
            value={flightForm.maxBagWeightKg}
            onChange={(e) => setFlightForm({ ...flightForm, maxBagWeightKg: Number(e.target.value) })}
          />

          <button type="submit">Add flight</button>
          {flightSaved && <span className="save-confirm">✓ Flight added</span>}
        </form>
      </div>

      <div className="card">
        <h2>Add passenger</h2>
        <form className="step" onSubmit={submitPassenger}>
          <label htmlFor="admin-flightId">Flight</label>
          <select
            id="admin-flightId"
            value={passengerForm.flightId}
            onChange={(e) => setPassengerForm({ ...passengerForm, flightId: e.target.value })}
          >
            <option value="">Select a flight</option>
            {flights.map((f) => (
              <option key={f.id} value={f.id}>
                {f.flightNumber} ({f.origin} → {f.destination})
              </option>
            ))}
          </select>

          <label htmlFor="admin-bookingRef">Booking reference</label>
          <input
            id="admin-bookingRef"
            placeholder="e.g. ABCD12"
            value={passengerForm.bookingRef}
            onChange={(e) => setPassengerForm({ ...passengerForm, bookingRef: e.target.value.toUpperCase() })}
          />

          <label htmlFor="admin-firstName">First name</label>
          <input
            id="admin-firstName"
            value={passengerForm.firstName}
            onChange={(e) => setPassengerForm({ ...passengerForm, firstName: e.target.value })}
          />

          <label htmlFor="admin-lastName">Last name</label>
          <input
            id="admin-lastName"
            value={passengerForm.lastName}
            onChange={(e) => setPassengerForm({ ...passengerForm, lastName: e.target.value })}
          />

          <label htmlFor="admin-groupId">Group ID (optional)</label>
          <input
            id="admin-groupId"
            placeholder="e.g. GRP-FAMILY-2"
            value={passengerForm.groupId}
            onChange={(e) => setPassengerForm({ ...passengerForm, groupId: e.target.value })}
          />

          <button type="submit" disabled={!passengerForm.flightId}>
            Add passenger
          </button>
          {passengerSaved && <span className="save-confirm">✓ Added {passengerSaved}</span>}
        </form>
      </div>
    </div>
  );
}
