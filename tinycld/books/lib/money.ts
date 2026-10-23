import { warnOnce } from './warn-once'

// Amounts are integer cents in memory and storage. PocketBase stores them as
// float64, which is exact only up to 2^53-1, so nothing above that is accepted.
export const maxStoredAmount = Number.MAX_SAFE_INTEGER

// The epsilon nudge makes values such as 1000.4999999999999 (10.005 * 100) round
// the way a person reading the decimal would expect.
export function roundHalfAwayFromZero(value: number): number {
    return Math.sign(value) * Math.round(Math.abs(value) * (1 + Number.EPSILON))
}

export function dollarsToCents(dollars: number): number {
    return roundHalfAwayFromZero(dollars * 100)
}

// Amounts are always shown with 2 decimals; currencies with other minor-unit
// sizes (JPY, KWD) are out of scope for books.
// Cannot collide with a currency code: codes never contain a NUL.
const nonFiniteKey = '\0non-finite'

export function formatMoney(cents: number, currency: string): string {
    if (!Number.isFinite(cents)) {
        warnOnce(nonFiniteKey, 'books.money', 'non-finite amount', { cents })
        return '\u2014'
    }
    // A value that rounds to zero would otherwise render as "-$0.00".
    const dollars = Math.abs(cents) < 0.5 ? 0 : cents / 100
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(dollars)
    } catch (err) {
        warnOnce(`currency:${currency}`, 'books.money', 'invalid currency code', { currency, err })
        const plain = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(dollars)
        return currency === '' ? plain : `${plain} ${currency}`
    }
}

// One optional "$" directly after the sign. Commas are valid only as thousands
// groups, and the first group cannot start with zero.
const moneyPattern = /^(-?)\$?([1-9]\d{0,2}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/

export function parseMoney(text: string): number | null {
    const match = moneyPattern.exec(text.trim())
    if (!match) return null
    const [, sign, whole, fraction = ''] = match
    // Integer math on the digits keeps the limit check exact; floats lose cents near 2^53.
    const cents = BigInt(whole.replace(/,/g, '') + fraction.padEnd(2, '0'))
    if (cents > BigInt(maxStoredAmount)) return null
    return sign === '-' && cents !== 0n ? -Number(cents) : Number(cents)
}
