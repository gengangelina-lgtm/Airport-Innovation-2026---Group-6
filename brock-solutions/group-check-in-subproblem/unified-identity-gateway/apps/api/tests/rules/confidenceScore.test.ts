import { describe, it, expect } from 'vitest';
import { calculateConfidenceScore } from '../../src/rules/confidenceScore';

const validDoc = {
  passportNumber: 'X1234567',
  fullName: 'Jane Doe',
  dob: '1990-05-01',
  nationality: 'US',
  expiryDate: '2030-01-01',
};

describe('calculateConfidenceScore', () => {
  it('returns 100 for a fully valid document', () => {
    expect(calculateConfidenceScore(validDoc)).toBe(100);
  });

  it('deducts 40 for malformed passport number', () => {
    expect(calculateConfidenceScore({ ...validDoc, passportNumber: '12' })).toBe(60);
  });

  it('deducts 20 for missing full name', () => {
    expect(calculateConfidenceScore({ ...validDoc, fullName: '' })).toBe(80);
  });

  it('deducts 20 for invalid dob', () => {
    expect(calculateConfidenceScore({ ...validDoc, dob: 'not-a-date' })).toBe(80);
  });

  it('deducts 20 for invalid expiry date', () => {
    expect(calculateConfidenceScore({ ...validDoc, expiryDate: 'not-a-date' })).toBe(80);
  });

  it('clamps at 0 when everything is wrong', () => {
    expect(
      calculateConfidenceScore({ passportNumber: '', fullName: '', dob: '', expiryDate: '', nationality: '' })
    ).toBe(0);
  });
});
