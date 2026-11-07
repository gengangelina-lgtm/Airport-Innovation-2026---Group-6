import { describe, it, expect } from 'vitest';
import { determineOverallStatus, isBagOverweight } from '../../src/rules/status';

describe('determineOverallStatus', () => {
  it('is NOT_STARTED with no document', () => {
    expect(
      determineOverallStatus({ documentStatus: null, anyBagOverweight: false, boardingPassIssued: false })
    ).toBe('NOT_STARTED');
  });

  it('is IN_PROGRESS once document is VALID', () => {
    expect(
      determineOverallStatus({ documentStatus: 'VALID', anyBagOverweight: false, boardingPassIssued: false })
    ).toBe('IN_PROGRESS');
  });

  it('is BLOCKED when document is BLOCKED, regardless of bags', () => {
    expect(
      determineOverallStatus({ documentStatus: 'BLOCKED', anyBagOverweight: false, boardingPassIssued: false })
    ).toBe('BLOCKED');
  });

  it('is NEEDS_REVIEW when document needs review', () => {
    expect(
      determineOverallStatus({ documentStatus: 'NEEDS_REVIEW', anyBagOverweight: false, boardingPassIssued: false })
    ).toBe('NEEDS_REVIEW');
  });

  it('is NEEDS_REVIEW when a bag is overweight even if document is valid', () => {
    expect(
      determineOverallStatus({ documentStatus: 'VALID', anyBagOverweight: true, boardingPassIssued: false })
    ).toBe('NEEDS_REVIEW');
  });

  it('is CLEARED once boarding pass is issued', () => {
    expect(
      determineOverallStatus({ documentStatus: 'VALID', anyBagOverweight: false, boardingPassIssued: true })
    ).toBe('CLEARED');
  });

  it('is NEEDS_REVIEW for an overweight bag even before any document is submitted', () => {
    expect(
      determineOverallStatus({ documentStatus: null, anyBagOverweight: true, boardingPassIssued: false })
    ).toBe('NEEDS_REVIEW');
  });
});

describe('isBagOverweight', () => {
  it('flags overweight when weight exceeds max', () => {
    expect(isBagOverweight(25, 23)).toBe(true);
  });

  it('does not flag when weight is within max', () => {
    expect(isBagOverweight(20, 23)).toBe(false);
  });

  it('does not flag when weight equals max', () => {
    expect(isBagOverweight(23, 23)).toBe(false);
  });
});
