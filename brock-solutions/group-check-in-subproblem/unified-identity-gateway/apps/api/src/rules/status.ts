export type CheckInStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'CLEARED' | 'BLOCKED' | 'NEEDS_REVIEW';
export type DocumentStatus = 'VALID' | 'BLOCKED' | 'NEEDS_REVIEW' | null;

export function determineOverallStatus(params: {
  documentStatus: DocumentStatus;
  anyBagOverweight: boolean;
  boardingPassIssued: boolean;
}): CheckInStatus {
  if (params.boardingPassIssued) return 'CLEARED';
  if (params.documentStatus === 'BLOCKED') return 'BLOCKED';
  if (params.documentStatus === 'NEEDS_REVIEW' || params.anyBagOverweight) return 'NEEDS_REVIEW';
  if (params.documentStatus === 'VALID') return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export function isBagOverweight(weightKg: number, maxBagWeightKg: number): boolean {
  return weightKg > maxBagWeightKg;
}
