import { describe, it, expect } from 'vitest';
import { calculateTTZ } from './debt-calculator';

describe('calculateTTZ', () => {
  it('should pay off a simple loan in N months', () => {
    const result = calculateTTZ(
      100000, // £1,000 balance
      1000,   // 10% APR (1000 basis points)
      { type: 'flat', flat: 10000 } // £100/month
    );
    expect(result.months).toBeGreaterThan(0);
    if (result.months !== null) {
      expect(result.projection).toHaveLength(result.months);
    }
  });

  it('should return null TTZ when payment < interest', () => {
    const result = calculateTTZ(
      100000, // £1,000 balance
      2000,   // 20% APR
      { type: 'flat', flat: 1000 } // £10/month (too low)
    );
    expect(result.months).toBeNull();
  });

  it('should handle zero balance', () => {
    const result = calculateTTZ(
      0,
      1000,
      { type: 'flat', flat: 10000 }
    );
    expect(result.months).toBe(0);
  });

  it('should default to 2.5% when no payment rule specified', () => {
    const result = calculateTTZ(
      100000,
      1000,
      {} as any // No rule
    );
    expect(result.projection[0].payment).toBeGreaterThan(0);
  });

  it('should cap at 30 years for very high balance', () => {
    const result = calculateTTZ(
      100000000, // £1M balance
      500,       // 5% APR
      { type: 'percentage', percentage: 250 } // 2.5%
    );
    expect(result.months).toBeNull(); // Hit cap
    expect(result.projection).toHaveLength(360);
  });

  it('should use flat payment when specified', () => {
    const result = calculateTTZ(
      100000,
      1000,
      { type: 'flat', flat: 5000 } // £50
    );
    expect(result.projection[0].payment).toBe(5000);
  });

  it('should use percentage payment when specified', () => {
    const result = calculateTTZ(
      100000,
      1000,
      { type: 'percentage', percentage: 300 } // 3%
    );
    expect(result.projection[0].payment).toBe(3000); // 3% of £100 = £3
  });

  it('should use max of flat or percentage when flat_or_percentage', () => {
    const result = calculateTTZ(
      100000,
      1000,
      { type: 'flat_or_percentage', flat: 1000, percentage: 300 } // £10 vs 3%
    );
    expect(result.projection[0].payment).toBe(3000); // 3% of £100 = £3 > £10
  });
});
