import { useState } from 'react';
import { api, formatApiError } from '../api';
import type { AuditLogEntry, Passenger } from '../types';

export function OverridePanel({ passenger, onUpdated }: { passenger: Passenger; onUpdated: (p: Passenger) => void }) {
  const [reason, setReason] = useState('');
  const [auditLog, setAuditLog] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canOverride = passenger.checkInStatus === 'BLOCKED' || passenger.checkInStatus === 'NEEDS_REVIEW';

  async function submitOverride(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await api.override(passenger.id, reason);
      onUpdated(updated);
      setReason('');
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function loadAuditLog() {
    setError(null);
    try {
      setAuditLog(await api.getAuditLog(passenger.id));
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <div className="card">
      <h3>Agent override</h3>
      {canOverride ? (
        <form className="step" onSubmit={submitOverride}>
          <label htmlFor="overrideReason">Reason for override</label>
          <textarea
            id="overrideReason"
            placeholder="e.g. Manually verified passport against printed document"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <button type="submit">Override to CLEARED</button>
        </form>
      ) : (
        <p>No override needed — passenger is not blocked or flagged.</p>
      )}
      {error && <p className="issue-list">{error}</p>}
      <button onClick={loadAuditLog}>Load audit log</button>
      {auditLog && (
        <ul>
          {auditLog.map((entry) => (
            <li key={entry.id}>
              {new Date(entry.timestamp).toLocaleString()} — {entry.prevStatus} → {entry.newStatus}: {entry.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
