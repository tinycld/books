import { warnOnce } from './warn-once'

// The limits and the typed-text parsing have no import, so code the generator
// loads in Node can use them; see money-text.ts.
export {
    centsToText,
    isWellFormedMoney,
    maxLineAmount,
    maxStoredAmount,
    parseMoney,
} from './money-text'

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

// cents / 100 as a float loses the last cent near 2^53, so a whole number of
// cents is formatted from its digits. Intl supplies only the currency layout
// (symbol, sign, separators) through formatToParts of a sample value; the digit
// groups are built here, so nothing depends on Intl accepting bigint or
// decimal strings (Hermes support for those is not assumed).
function formatCents(format: Intl.NumberFormat, cents: number): string {
    if (!Number.isSafeInteger(cents)) return format.format(cents / 100)
    const magnitude = Math.abs(cents)
    const whole = String(Math.floor(magnitude / 100)).replace(/\B(?=(\d{3})+$)/g, ',')
    const fraction = String(magnitude % 100).padStart(2, '0')
    return format
        .formatToParts(cents < 0 ? -1 : 1)
        .map(part => {
            if (part.type === 'integer') return whole
            if (part.type === 'fraction') return fraction
            return part.value
        })
        .join('')
}

// Its output parses back with parseMoney (money-text.ts).
export function formatMoney(cents: number, currency: string): string {
    if (!Number.isFinite(cents)) {
        warnOnce(nonFiniteKey, 'books.money', 'non-finite amount', { cents })
        return '\u2014'
    }
    // A value that rounds to zero would otherwise render as "-$0.00".
    const amount = Math.abs(cents) < 0.5 ? 0 : cents
    const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    let currencyFormat: Intl.NumberFormat | undefined
    try {
        currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency, ...digits })
    } catch (err) {
        warnOnce(`currency:${currency}`, 'books.money', 'invalid currency code', { currency, err })
    }
    if (currencyFormat) return formatCents(currencyFormat, amount)
    const plain = formatCents(new Intl.NumberFormat('en-US', digits), amount)
    return currency === '' ? plain : `${plain} ${currency}`
}

// A zero side of a line shows nothing, so a debit-only line has a blank credit cell.
export function amountText(cents: number, currency: string): string {
    return cents === 0 ? '' : formatMoney(cents, currency)
}

// A balance that is not exact is null (lib/account-tree.ts ownBalance): one of
// its sums, or their net, is past the range where a number holds every cent.
// It is shown as this text in the error tone, never as a number that can be
// wrong by cents.
export const TOO_LARGE_TEXT = 'Too large'

export function balanceText(balance: number | null, currency: string): string {
    return balance === null ? TOO_LARGE_TEXT : formatMoney(balance, currency)
}

export function balanceTone(balance: number | null): string {
    return balance === null ? 'text-danger' : 'text-foreground'
}
