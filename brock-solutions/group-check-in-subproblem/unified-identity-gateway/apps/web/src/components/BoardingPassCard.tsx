import { QRCodeSVG } from 'qrcode.react';
import type { Passenger } from '../types';

export function BoardingPassCard({ passenger }: { passenger: Passenger }) {
  if (!passenger.boardingPass) return null;
  return (
    <div className="card boarding-pass">
      <div className="boarding-pass-band">
        <h3>Boarding pass</h3>
        <span className="flight-code">{passenger.flight.flightNumber}</span>
      </div>
      <div className="boarding-pass-body">
        <div className="boarding-pass-fields">
          <div>
            <span className="field-label">Passenger</span>
            <span className="field-value">
              {passenger.firstName} {passenger.lastName}
            </span>
          </div>
          <div>
            <span className="field-label">Route</span>
            <span className="field-value">
              {passenger.flight.origin} → {passenger.flight.destination}
            </span>
          </div>
          <div>
            <span className="field-label">Seat</span>
            <span className="field-value">{passenger.boardingPass.seatNumber}</span>
          </div>
          <div>
            <span className="field-label">Booking</span>
            <span className="field-value">{passenger.bookingRef}</span>
          </div>
        </div>
        <QRCodeSVG value={passenger.boardingPass.qrPayload} size={110} />
      </div>
      {passenger.bags.length > 0 && (
        <>
          <hr className="boarding-pass-divider" />
          {passenger.bags.map((bag) => (
            <div key={bag.id} className="bag-tag">
              <QRCodeSVG value={bag.tagId} size={56} />
              <div>
                <span className="field-label">Bag tag</span>
                <span className="field-value">
                  {bag.tagId} — {bag.weightKg}kg {bag.overweight && <span className="overweight">(OVERWEIGHT)</span>}
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
