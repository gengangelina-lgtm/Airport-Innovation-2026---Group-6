import { describe, it, expect } from 'vitest';
import { validateDocument } from '../../src/rules/validateDocument';

const baseDoc = {
  passportNumber: 'X1234567',
  fullName: 'Jane Doe',
  dob: '1990-05-01',
  nationality: 'US',
  expiryDate: '2030-01-01',
};

const departureTime = '2026-08-01T10:00:00.000Z';

describe('validateDocument', () => {
  it('returns VALID for a clean document, normal destination', () => {
    const result = validateDocument(baseDoc, 'Jane Doe', 'LHR', departureTime, ['DXB'], true);
    expect(result.status).toBe('VALID');
    expect(result.issues).toEqual([]);
  });

  it('blocks on missing/malformed passport number', () => {
    const result = validateDocument({ ...baseDoc, passportNumber: '' }, 'Jane Doe', 'LHR', departureTime, [], true);
    expect(result.status).toBe('BLOCKED');
    expect(result.issues).toContain('missing_or_invalid_passport_number');
  });

  it('blocks on expired document', () => {
    const result = validateDocument(
      { ...baseDoc, expiryDate: '2026-01-01' },
      'Jane Doe',
      'LHR',
      departureTime,
      [],
      true
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.issues).toContain('document_expired');
  });

  it('blocks on failed face match', () => {
    const result = validateDocument(baseDoc, 'Jane Doe', 'LHR', departureTime, [], false);
    expect(result.status).toBe('BLOCKED');
    expect(result.issues).toContain('face_match_failed');
  });

  it('flags name mismatch as needs review (not blocked)', () => {
    const result = validateDocument(baseDoc, 'John Smith', 'LHR', departureTime, [], true);
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.issues).toContain('name_mismatch');
  });

  it('name match is order/case/punctuation insensitive', () => {
    const result = validateDocument(baseDoc, 'doe, jane', 'LHR', departureTime, [], true);
    expect(result.issues).not.toContain('name_mismatch');
  });

  it('flags extra-check destination as needs review', () => {
    const result = validateDocument(baseDoc, 'Jane Doe', 'DXB', departureTime, ['DXB'], true);
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.issues).toContain('extra_checks_required_destination');
  });

  it('flags low confidence score as needs review', () => {
    const result = validateDocument(
      { ...baseDoc, fullName: '', dob: 'bad' },
      '',
      'LHR',
      departureTime,
      [],
      true
    );
    expect(result.issues).toContain('low_document_confidence');
  });

  it('hard block wins over soft flags', () => {
    const result = validateDocument(
      { ...baseDoc, passportNumber: '' },
      'John Smith',
      'DXB',
      departureTime,
      ['DXB'],
      true
    );
    expect(result.status).toBe('BLOCKED');
  });
});
