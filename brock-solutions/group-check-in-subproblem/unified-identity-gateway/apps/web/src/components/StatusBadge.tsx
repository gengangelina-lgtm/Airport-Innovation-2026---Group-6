import type { CheckInStatus } from '../types';

export function StatusBadge({ status }: { status: CheckInStatus }) {
  return <span className={`status-badge status-${status}`}>{status.replace('_', ' ')}</span>;
}
