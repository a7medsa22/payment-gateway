import Decimal from 'decimal.js';
import { Currency } from '@shared/constants/payment.constants';

export class Money {
    private readonly _amount: Decimal;
    private readonly _currency: Currency;

    private constructor(amount: Decimal, currency: Currency) {
        if (amount.isNegative()) {
            throw new Error('Money amount cannot be negative');
        }

        // Max 4 decimal places for sub-cent precision
        this._amount = amount.toDecimalPlaces(4);
        this._currency = currency;
    }

    /**
     * Create Money from number or string
     * @param amount - Can be number or string for precision
     * @param currency - ISO currency code
     */
    static from(amount: number | string, currency: Currency): Money {
        const decimal = new Decimal(amount);
        return new Money(decimal, currency);
    }

    static zero(currency: Currency = 'USD'): Money {
        return new Money(new Decimal(0), currency);
    }

    // Getters
    get amount(): string {
        return this._amount.toFixed(4);
    }

    get amountAsNumber(): number {
        return this._amount.toNumber();
    }

    get currency(): Currency {
        return this._currency;
    }

    // Arithmetic operations (all return new Money instances - immutable)

    add(other: Money): Money {
        this.assertSameCurrency(other);
        const result = this._amount.plus(new Decimal(other.amount));
        return new Money(result, this._currency);
    }

    subtract(other: Money): Money {
        this.assertSameCurrency(other);
        const result = this._amount.minus(new Decimal(other.amount));

        if (result.isNegative()) {
            throw new Error('Subtraction would result in negative amount');
        }

        return new Money(result, this._currency);
    }

    multiply(factor: number | string): Money {
        const multiplier = new Decimal(factor);

        if (multiplier.isNegative()) {
            throw new Error('Multiplier cannot be negative');
        }

        const result = this._amount.times(multiplier);
        return new Money(result, this._currency);
    }

    divide(divisor: number | string): Money {
        const divider = new Decimal(divisor);

        if (divider.isZero() || divider.isNegative()) {
            throw new Error('Divisor must be positive');
        }

        const result = this._amount.dividedBy(divider);
        return new Money(result, this._currency);
    }

    // Comparison operations

    isGreaterThan(other: Money): boolean {
        this.assertSameCurrency(other);
        return this._amount.greaterThan(new Decimal(other.amount));
    }

    isLessThan(other: Money): boolean {
        this.assertSameCurrency(other);
        return this._amount.lessThan(new Decimal(other.amount));
    }

    isEqualTo(other: Money): boolean {
        if (this._currency !== other._currency) {
            return false;
        }
        return this._amount.equals(new Decimal(other.amount));
    }

    isGreaterThanOrEqual(other: Money): boolean {
        this.assertSameCurrency(other);
        return this._amount.greaterThanOrEqualTo(new Decimal(other.amount));
    }

    isLessThanOrEqual(other: Money): boolean {
        this.assertSameCurrency(other);
        return this._amount.lessThanOrEqualTo(new Decimal(other.amount));
    }

    isZero(): boolean {
        return this._amount.isZero();
    }

    isPositive(): boolean {
        return this._amount.isPositive();
    }

    // Utility methods

    /**
     * Convert to cents (for payment providers like Stripe)
     */
    toCents(): number {
        return this._amount.times(100).toNumber();
    }

    /**
     * Create from cents
     */
    static fromCents(cents: number, currency: Currency): Money {
        const decimal = new Decimal(cents).dividedBy(100);
        return new Money(decimal, currency);
    }

    /**
     * Allocate amount proportionally (for split payments)
     * @param ratios - Array of ratios (must sum to 1)
     */
    allocate(ratios: number[]): Money[] {
        const sum = ratios.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1) > 0.0001) {
            throw new Error('Ratios must sum to 1');
        }

        const results: Money[] = [];
        let remainder = this._amount;

        for (let i = 0; i < ratios.length - 1; i++) {
            const share = this._amount.times(ratios[i]).toDecimalPlaces(4, Decimal.ROUND_DOWN);
            results.push(new Money(share, this._currency));
            remainder = remainder.minus(share);
        }

        // Last allocation gets remainder to handle rounding
        results.push(new Money(remainder, this._currency));

        return results;
    }

    /**
     * For JSON serialization
     */
    toJSON(): { amount: string; currency: Currency } {
        return {
            amount: this.amount, // String for precision
            currency: this._currency,
        };
    }

    toString(): string {
        return `${this._currency} ${this._amount.toFixed(2)}`;
    }


    toDetailedString(): string {
        return `${this._currency} ${this._amount.toFixed(4)}`;
    }

    ////////// Private helpers /////////

    private assertSameCurrency(other: Money): void {
        if (this._currency !== other._currency) {
            throw new Error(
                `Currency mismatch: cannot operate on ${this._currency} and ${other._currency}`,
            );
        }
    }

    /**
     * Value object equality
     */
    equals(other: Money): boolean {
        return this.isEqualTo(other);
    }
}

// Export type for convenience
export type MoneyProps = {
    amount: string;
    currency: Currency;
};