import { useState } from 'react';
import { api, formatApiError } from '../api';
import { CheckInWizard } from './CheckInWizard';
import type { Passenger } from '../types';

export function PassengerView() {
  const [bookingRef, setBookingRef] = useState('');
  const [lastName, setLastName] = useState('');
  const [passenger, setPassenger] = useState<Passenger | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setPassenger(await api.lookupPassenger(bookingRef, lastName));
    } catch (err) {
      setError(formatApiError(err, 'Booking not found'));
    }
  }

  function back() {
    setPassenger(null);
    setBookingRef('');
    setLastName('');
    setError(null);
  }

  if (passenger) return <CheckInWizard passenger={passenger} onBack={back} />;

  return (
    <div className="card">
      <h2>Find your booking</h2>
      <form className="step" onSubmit={lookup}>
        <label htmlFor="bookingRef">Booking reference</label>
        <input id="bookingRef" placeholder="e.g. CLEAN1" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />

        <label htmlFor="lastName">Last name</label>
        <input id="lastName" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />

        <button type="submit">Find booking</button>
      </form>
      {error && <p className="issue-list">{error}</p>}
    </div>
  );
}
