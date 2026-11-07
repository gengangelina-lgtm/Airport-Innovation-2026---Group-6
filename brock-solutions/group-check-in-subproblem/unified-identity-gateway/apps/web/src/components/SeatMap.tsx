import { Fragment } from 'react';
import type { SeatmapSeat } from '../types';

const ZONE_ORDER: SeatmapSeat['cabinZone'][] = ['FRONT', 'MID', 'REAR'];
const ZONE_LABEL: Record<SeatmapSeat['cabinZone'], string> = {
  FRONT: 'Front cabin',
  MID: 'Mid cabin',
  REAR: 'Rear cabin',
};

function groupByRow(seats: SeatmapSeat[]) {
  const rows = new Map<number, SeatmapSeat[]>();
  for (const seat of seats) {
    const row = parseInt(seat.seatNumber, 10);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(seat);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, rowSeats]) => ({ row, seats: rowSeats.sort((a, b) => a.seatNumber.localeCompare(b.seatNumber)) }));
}

export function SeatMap({
  seats,
  currentSeatId,
  onSelect,
}: {
  seats: SeatmapSeat[];
  currentSeatId?: string;
  onSelect: (seatId: string) => void;
}) {
  const zones = ZONE_ORDER.map((zone) => ({ zone, rows: groupByRow(seats.filter((s) => s.cabinZone === zone)) })).filter(
    (z) => z.rows.length > 0,
  );

  return (
    <div className="seat-map">
      {zones.map(({ zone, rows }) => (
        <div key={zone} className="seat-zone">
          <h4>{ZONE_LABEL[zone]}</h4>
          {rows.map(({ row, seats: rowSeats }) => (
            <div key={row} className="seat-row">
              <span className="seat-row-number">{row}</span>
              {rowSeats.map((seat, i) => {
                const isCurrent = seat.id === currentSeatId;
                return (
                  <Fragment key={seat.id}>
                    {i === Math.ceil(rowSeats.length / 2) && <span className="seat-aisle" />}
                    <button
                      type="button"
                      className={`seat ${isCurrent ? 'seat-current' : seat.occupied ? 'seat-occupied' : 'seat-available'}`}
                      disabled={seat.occupied}
                      title={
                        isCurrent
                          ? `${seat.seatNumber} — your current seat`
                          : seat.occupied
                            ? `${seat.seatNumber} — occupied by ${seat.passenger?.firstName} ${seat.passenger?.lastName}`
                            : `${seat.seatNumber} — available`
                      }
                      onClick={() => onSelect(seat.id)}
                    >
                      {seat.seatNumber.replace(String(row), '')}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          ))}
        </div>
      ))}
      <div className="seat-legend">
        <span>
          <i className="seat-swatch seat-available" /> Available
        </span>
        <span>
          <i className="seat-swatch seat-occupied" /> Occupied
        </span>
        {currentSeatId && (
          <span>
            <i className="seat-swatch seat-current" /> Your current seat
          </span>
        )}
      </div>
    </div>
  );
}
