// utils/formatCurrency.test.js
import { describe, it, expect } from 'vitest';
import { formatINR, formatCompact, formatNAV } from './formatCurrency';

describe('formatINR', () => {
  it('formats 0 correctly', () => {
    expect(formatINR(0)).toBe('₹0');
  });

  it('formats small numbers', () => {
    expect(formatINR(100)).toBe('₹100');
    expect(formatINR(999)).toBe('₹999');
  });

  it('formats thousands', () => {
    expect(formatINR(1000)).toBe('₹1,000');
    expect(formatINR(15000)).toBe('₹15,000');
  });

  it('formats lakhs', () => {
    expect(formatINR(100000)).toBe('₹1,00,000');
    expect(formatINR(1250000)).toBe('₹12,50,000');
  });

  it('formats crores', () => {
    expect(formatINR(10000000)).toBe('₹1,00,00,000');
    expect(formatINR(250000000)).toBe('₹25,00,00,000');
  });

  it('rounds decimal values', () => {
    // formatINR rounds to integer by default (decimals = 0)
    expect(formatINR(1234.56)).toBe('₹1,235');
    expect(formatINR(100000.5)).toBe('₹1,00,001');
  });

  it('handles large numbers', () => {
    expect(formatINR(1000000000)).toBe('₹1,00,00,00,000');
  });

  it('returns ₹0 for null/undefined', () => {
    expect(formatINR(null)).toBe('₹0');
    expect(formatINR(undefined)).toBe('₹0');
    expect(formatINR(NaN)).toBe('₹0');
  });
});

describe('formatCompact', () => {
  it('formats crores compactly', () => {
    expect(formatCompact(15000000)).toBe('₹1.50 Cr');
  });

  it('formats lakhs compactly', () => {
    expect(formatCompact(450000)).toBe('₹4.50 L');
  });

  it('falls back to formatINR for small numbers', () => {
    expect(formatCompact(50000)).toBe('₹50,000');
  });
});

describe('formatNAV', () => {
  it('formats NAV with 4 decimal places', () => {
    expect(formatNAV('123.4567')).toBe('₹123.4567');
  });

  it('returns — for null/undefined', () => {
    expect(formatNAV(null)).toBe('—');
    expect(formatNAV(undefined)).toBe('—');
  });
});
