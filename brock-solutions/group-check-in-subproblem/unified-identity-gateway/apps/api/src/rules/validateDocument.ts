import { calculateConfidenceScore, DocumentInput, PASSPORT_FORMAT } from './confidenceScore';

export interface DocumentValidationResult {
  status: 'VALID' | 'BLOCKED' | 'NEEDS_REVIEW';
  issues: string[];
  confidenceScore: number;
}

function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function namesMatch(bookingName: string, docFullName: string): boolean {
  const a = normalizeName(bookingName);
  const b = normalizeName(docFullName);
  return a.length === b.length && a.every((token, i) => token === b[i]);
}

export function validateDocument(
  doc: DocumentInput,
  bookingFullName: string,
  destination: string,
  departureTimeIso: string,
  extraCheckDestinations: string[],
  faceMatchPassed: boolean
): DocumentValidationResult {
  const hardIssues: string[] = [];
  const softIssues: string[] = [];

  if (!PASSPORT_FORMAT.test(doc.passportNumber)) {
    hardIssues.push('missing_or_invalid_passport_number');
  }

  const expiry = Date.parse(doc.expiryDate);
  const departure = Date.parse(departureTimeIso);
  if (Number.isNaN(expiry) || expiry <= departure) {
    hardIssues.push('document_expired');
  }

  if (!faceMatchPassed) {
    hardIssues.push('face_match_failed');
  }

  const confidenceScore = calculateConfidenceScore(doc);

  if (hardIssues.length === 0) {
    if (!namesMatch(bookingFullName, doc.fullName)) {
      softIssues.push('name_mismatch');
    }
    if (extraCheckDestinations.includes(destination)) {
      softIssues.push('extra_checks_required_destination');
    }
    if (confidenceScore <= 60) {
      softIssues.push('low_document_confidence');
    }
  }

  const status = hardIssues.length > 0 ? 'BLOCKED' : softIssues.length > 0 ? 'NEEDS_REVIEW' : 'VALID';

  return { status, issues: [...hardIssues, ...softIssues], confidenceScore };
}
