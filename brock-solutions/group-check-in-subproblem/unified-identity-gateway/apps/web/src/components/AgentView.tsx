import { useEffect, useState } from 'react';
import { api, formatApiError } from '../api';
import { StatusBadge } from './StatusBadge';
import { CheckInWizard } from './CheckInWizard';
import { OverridePanel } from './OverridePanel';
import type { Flight, Passenger } from '../types';

export function AgentView() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flightId, setFlightId] = useState('');
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'BLOCKED' | 'NEEDS_REVIEW'>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listFlights()
      .then((fs) => {
        setFlights(fs);
        if (fs[0]) setFlightId(fs[0].id);
      })
      .catch((err) => setError(formatApiError(err)));
  }, []);

  useEffect(() => {
    if (!flightId) return;
    api
      .listPassengers(flightId)
      .then(setPassengers)
      .catch((err) => setError(formatApiError(err)));
  }, [flightId]);

  const visible = passengers.filter((p) => filter === 'ALL' || p.checkInStatus === filter);

  function handleUpdated(updated: Passenger) {
    setSelected(updated);
    setPassengers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div>
      {error && <p className="issue-list">{error}</p>}
      <div className="card">
        <div className="toolbar">
          <label htmlFor="flightSelect">
            Flight
            <select id="flightSelect" value={flightId} onChange={(e) => setFlightId(e.target.value)}>
              {flights.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.flightNumber} ({f.origin} → {f.destination})
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="statusFilter">
            Filter by status
            <select id="statusFilter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="ALL">All</option>
              <option value="BLOCKED">Blocked</option>
              <option value="NEEDS_REVIEW">Needs review</option>
            </select>
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Booking</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} onClick={() => setSelected(p)} className={selected?.id === p.id ? 'selected-row' : ''}>
                <td>
                  {p.firstName} {p.lastName}
                </td>
                <td>{p.bookingRef}</td>
                <td>
                  <StatusBadge status={p.checkInStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <>
          <CheckInWizard key={selected.id} passenger={selected} onBack={() => setSelected(null)} />
          <OverridePanel passenger={selected} onUpdated={handleUpdated} />
        </>
      )}
    </div>
  );
}
