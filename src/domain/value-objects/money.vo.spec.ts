import { Money } from './money.vo';
import { Currency } from '@domain/enums';

describe('Money Value Object', () => {
  describe('Construction', () => {
    it('should create a valid Money instance from string or number', () => {
      const moneyFromString = Money.from('100.50', 'USD');
      const moneyFromNumber = Money.from(100.5, 'USD');

      expect(moneyFromString.amount).toBe('100.5000');
      expect(moneyFromString.currency).toBe('USD');
      expect(moneyFromNumber.amountAsNumber).toBe(100.5);
    });

    it('should create zero Money instance', () => {
      const zeroUSD = Money.zero('USD');
      expect(zeroUSD.amount).toBe('0.0000');
      expect(zeroUSD.currency).toBe('USD');
      expect(zeroUSD.isZero()).toBe(true);

      const defaultZero = Money.zero();
      expect(defaultZero.currency).toBe('USD');
    });

    it('should throw error when amount is negative', () => {
      expect(() => Money.from(-10, 'USD')).toThrow('Money amount cannot be negative');
      expect(() => Money.from('-5.00', 'EUR')).toThrow('Money amount cannot be negative');
    });
  });

  describe('Arithmetic Operations', () => {
    it('should add two Money instances with same currency', () => {
      const m1 = Money.from('50.25', 'USD');
      const m2 = Money.from('25.75', 'USD');
      const sum = m1.add(m2);

      expect(sum.amount).toBe('76.0000');
      expect(sum.currency).toBe('USD');
    });

    it('should throw error when adding different currencies', () => {
      const usd = Money.from('50.00', 'USD');
      const eur = Money.from('50.00', 'EUR');

      expect(() => usd.add(eur)).toThrow('Currency mismatch: cannot operate on USD and EUR');
    });

    it('should subtract two Money instances with same currency', () => {
      const m1 = Money.from('100.00', 'USD');
      const m2 = Money.from('40.50', 'USD');
      const diff = m1.subtract(m2);

      expect(diff.amount).toBe('59.5000');
    });

    it('should throw error when subtraction results in negative amount', () => {
      const m1 = Money.from('10.00', 'USD');
      const m2 = Money.from('20.00', 'USD');

      expect(() => m1.subtract(m2)).toThrow('Subtraction would result in negative amount');
    });

    it('should multiply Money by a positive factor', () => {
      const m = Money.from('12.50', 'USD');
      const result = m.multiply(3);

      expect(result.amount).toBe('37.5000');
    });

    it('should throw error when multiplying by negative factor', () => {
      const m = Money.from('10.00', 'USD');
      expect(() => m.multiply(-2)).toThrow('Multiplier cannot be negative');
    });

    it('should divide Money by a positive factor', () => {
      const m = Money.from('100.00', 'USD');
      const result = m.divide(4);

      expect(result.amount).toBe('25.0000');
    });

    it('should throw error when dividing by zero or negative', () => {
      const m = Money.from('100.00', 'USD');
      expect(() => m.divide(0)).toThrow('Divisor must be positive');
      expect(() => m.divide(-2)).toThrow('Divisor must be positive');
    });
  });

  describe('Comparisons', () => {
    const m100 = Money.from('100.00', 'USD');
    const m50 = Money.from('50.00', 'USD');
    const m100Same = Money.from('100.00', 'USD');
    const m100Eur = Money.from('100.00', 'EUR');

    it('should perform greaterThan comparison', () => {
      expect(m100.isGreaterThan(m50)).toBe(true);
      expect(m50.isGreaterThan(m100)).toBe(false);
    });

    it('should perform lessThan comparison', () => {
      expect(m50.isLessThan(m100)).toBe(true);
      expect(m100.isLessThan(m50)).toBe(false);
    });

    it('should perform isEqualTo comparison', () => {
      expect(m100.isEqualTo(m100Same)).toBe(true);
      expect(m100.isEqualTo(m50)).toBe(false);
      expect(m100.isEqualTo(m100Eur)).toBe(false);
    });

    it('should perform equals method', () => {
      expect(m100.equals(m100Same)).toBe(true);
      expect(m100.equals(m50)).toBe(false);
    });

    it('should check isGreaterThanOrEqual and isLessThanOrEqual', () => {
      expect(m100.isGreaterThanOrEqual(m100Same)).toBe(true);
      expect(m100.isGreaterThanOrEqual(m50)).toBe(true);
      expect(m50.isLessThanOrEqual(m100)).toBe(true);
    });

    it('should check isZero and isPositive', () => {
      expect(Money.zero('USD').isZero()).toBe(true);
      expect(m100.isZero()).toBe(false);
      expect(m100.isPositive()).toBe(true);
    });
  });

  describe('Financial Precision (Decimal.js)', () => {
    it('should avoid floating point inaccuracy (0.1 + 0.2 = 0.3)', () => {
      const m1 = Money.from('0.10', 'USD');
      const m2 = Money.from('0.20', 'USD');
      const sum = m1.add(m2);

      expect(sum.amount).toBe('0.3000');
      expect(sum.amountAsNumber).toBe(0.3);
    });
  });

  describe('Provider Conversion (Cents)', () => {
    it('should convert Money to cents and back', () => {
      const money = Money.from('49.99', 'USD');
      const cents = money.toCents();

      expect(cents).toBe(4999);

      const restored = Money.fromCents(cents, 'USD');
      expect(restored.equals(money)).toBe(true);
    });
  });

  describe('Allocation / Split', () => {
    it('should allocate Money proportionally handling remainder', () => {
      const total = Money.from('100.00', 'USD');
      const splits = total.allocate([0.5, 0.5]);

      expect(splits).toHaveLength(2);
      expect(splits[0].amount).toBe('50.0000');
      expect(splits[1].amount).toBe('50.0000');
    });

    it('should handle non-exact division remainder in last share', () => {
      const total = Money.from('10.00', 'USD');
      const splits = total.allocate([0.33, 0.33, 0.34]);

      expect(splits[0].amount).toBe('3.3000');
      expect(splits[1].amount).toBe('3.3000');
      expect(splits[2].amount).toBe('3.4000');

      const sum = splits[0].add(splits[1]).add(splits[2]);
      expect(sum.equals(total)).toBe(true);
    });

    it('should throw error when allocation ratios do not sum to 1', () => {
      const total = Money.from('100.00', 'USD');
      expect(() => total.allocate([0.5, 0.2])).toThrow('Ratios must sum to 1');
    });
  });

  describe('Serialization and Formatting', () => {
    it('should serialize to JSON properly', () => {
      const money = Money.from('25.50', 'USD');
      expect(money.toJSON()).toEqual({
        amount: '25.5000',
        currency: 'USD',
      });
    });

    it('should format toString and toDetailedString', () => {
      const money = Money.from('1500.75', 'USD');
      expect(money.toString()).toBe('USD 1500.75');
      expect(money.toDetailedString()).toBe('USD 1500.7500');
    });
  });
});
