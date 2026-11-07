export interface DocumentInput {
  passportNumber: string;
  fullName: string;
  dob: string;
  nationality: string;
  expiryDate: string;
}

export const PASSPORT_FORMAT = /^[A-Z0-9]{6,9}$/;

function isValidDate(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function calculateConfidenceScore(doc: DocumentInput): number {
  let score = 100;

  if (!PASSPORT_FORMAT.test(doc.passportNumber)) score -= 40;
  if (!doc.fullName || doc.fullName.trim().length < 2) score -= 20;
  if (!isValidDate(doc.dob)) score -= 20;
  if (!isValidDate(doc.expiryDate)) score -= 20;

  return Math.max(0, Math.min(100, score));
}
