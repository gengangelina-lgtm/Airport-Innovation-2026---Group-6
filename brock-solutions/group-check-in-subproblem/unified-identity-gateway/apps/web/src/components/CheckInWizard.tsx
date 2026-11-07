import { useState } from 'react';
import { api, formatApiError } from '../api';
import { StatusBadge } from './StatusBadge';
import { BoardingPassCard } from './BoardingPassCard';
import { SeatMap } from './SeatMap';
import { DocumentCapture, type DocumentCaptureResult } from './DocumentCapture';
import type { Passenger, SeatmapSeat } from '../types';

export function CheckInWizard({ passenger: initial, onBack }: { passenger: Passenger; onBack?: () => void }) {
  const [passenger, setPassenger] = useState(initial);
  const [seats, setSeats] = useState<SeatmapSeat[] | null>(null);
  const [bagCount, setBagCount] = useState(1);
  const [bagWeights, setBagWeights] = useState<number[]>([20]);
  const [error, setError] = useState<string | null>(null);
  const [docSaved, setDocSaved] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [bagsSaved, setBagsSaved] = useState(false);
  const [doc, setDoc] = useState({
    passportNumber: '',
    fullName: `${initial.firstName} ${initial.lastName}`,
    dob: '',
    nationality: '',
    expiryDate: '',
  });

  async function refresh(id: string) {
    setError(null);
    try {
      setPassenger(await api.getPassenger(id));
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  function openDocumentCapture(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDocSaved(false);
    setShowCapture(true);
  }

  async function completeDocumentCapture(result: DocumentCaptureResult) {
    setShowCapture(false);
    setError(null);
    try {
      const updated = await api.submitDocument(passenger.id, { ...doc, ...result });
      setPassenger(updated);
      setDocSaved(true);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function loadSeats() {
    setError(null);
    try {
      const { seats } = await api.getSeatmap(passenger.flightId);
      setSeats(seats);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function chooseSeat(seatId: string) {
    setError(null);
    try {
      const updated = await api.confirmSeat(passenger.id, seatId);
      setPassenger(updated);
      setSeats(null);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function submitBags(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBagsSaved(false);
    try {
      const bags = bagWeights.slice(0, bagCount).map((weightKg) => ({ weightKg }));
      const updated = await api.declareBags(passenger.id, bags);
      setPassenger(updated);
      setBagsSaved(true);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function issuePass() {
    setError(null);
    try {
      const updated = await api.issueBoardingPass(passenger.id);
      setPassenger(updated);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <div className="card">
      {onBack && (
        <button type="button" className="back-button" onClick={onBack}>
          ← Back
        </button>
      )}
      <h2>
        {passenger.firstName} {passenger.lastName} — {passenger.bookingRef}
      </h2>
      <StatusBadge status={passenger.checkInStatus} />
      {passenger.document && passenger.document.issues.length > 0 && (
        <ul className="issue-list">
          {passenger.document.issues.map((issue) => (
            <li key={issue}>{issue.replace(/_/g, ' ')}</li>
          ))}
        </ul>
      )}
      {passenger.riskFlags.length > 0 && (
        <ul className="issue-list">
          {passenger.riskFlags.map((flag) => (
            <li key={flag}>{flag.replace(/_/g, ' ')}</li>
          ))}
        </ul>
      )}
      {error && <p className="issue-list">{error}</p>}

      <h3>1. Document</h3>
      {showCapture && <DocumentCapture onComplete={completeDocumentCapture} onCancel={() => setShowCapture(false)} />}
      <form className="step" onSubmit={openDocumentCapture}>
        <label htmlFor="passportNumber">Passport number</label>
        <input
          id="passportNumber"
          placeholder="e.g. X1234567"
          value={doc.passportNumber}
          onChange={(e) => setDoc({ ...doc, passportNumber: e.target.value })}
        />

        <label htmlFor="fullName">Full name on document</label>
        <input
          id="fullName"
          placeholder="Full name on document"
          value={doc.fullName}
          onChange={(e) => setDoc({ ...doc, fullName: e.target.value })}
        />

        <label htmlFor="dob">Date of birth</label>
        <input id="dob" type="date" value={doc.dob} onChange={(e) => setDoc({ ...doc, dob: e.target.value })} />

        <label htmlFor="nationality">Nationality</label>
        <input
          id="nationality"
          placeholder="e.g. US"
          value={doc.nationality}
          onChange={(e) => setDoc({ ...doc, nationality: e.target.value })}
        />

        <label htmlFor="expiryDate">Passport expiry date</label>
        <input
          id="expiryDate"
          type="date"
          value={doc.expiryDate}
          onChange={(e) => setDoc({ ...doc, expiryDate: e.target.value })}
        />

        <button type="submit">Submit document</button>
        {docSaved && <span className="save-confirm">✓ Document submitted</span>}
      </form>

      <h3>2. Seat</h3>
      {passenger.seat && !seats && (
        <p>
          Assigned seat: {passenger.seat.seatNumber}
          {!passenger.boardingPass && (
            <button style={{ marginLeft: 12 }} onClick={loadSeats}>
              Change seat
            </button>
          )}
        </p>
      )}
      {!passenger.seat && !seats && <button onClick={loadSeats}>Load seat map</button>}
      {seats && <SeatMap seats={seats} currentSeatId={passenger.seat?.id} onSelect={chooseSeat} />}

      <h3>3. Bags</h3>
      <form className="step" onSubmit={submitBags}>
        <label htmlFor="bagCount">Number of bags (max weight {passenger.flight.maxBagWeightKg}kg each)</label>
        <input
          id="bagCount"
          type="number"
          min={0}
          max={5}
          value={bagCount}
          onChange={(e) => {
            const n = Number(e.target.value);
            setBagCount(n);
            setBagWeights((w) => Array.from({ length: n }, (_, i) => w[i] ?? 20));
          }}
        />
        {Array.from({ length: bagCount }).map((_, i) => (
          <div key={i}>
            <label htmlFor={`bagWeight-${i}`}>Bag {i + 1} weight (kg)</label>
            <input
              id={`bagWeight-${i}`}
              type="number"
              value={bagWeights[i] ?? 20}
              onChange={(e) => {
                const next = [...bagWeights];
                next[i] = Number(e.target.value);
                setBagWeights(next);
              }}
            />
          </div>
        ))}
        <button type="submit">Declare bags</button>
        {bagsSaved && <span className="save-confirm">✓ Bags declared</span>}
      </form>

      <h3>4. Boarding pass</h3>
      {passenger.boardingPass ? (
        <BoardingPassCard passenger={passenger} />
      ) : (
        <button onClick={issuePass} disabled={passenger.checkInStatus === 'BLOCKED' || passenger.checkInStatus === 'NEEDS_REVIEW'}>
          Issue boarding pass
        </button>
      )}

      <button style={{ marginTop: 12 }} onClick={() => refresh(passenger.id)}>
        Refresh
      </button>
    </div>
  );
}
