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

// formatMoney output must parse back. With a currency, only that currency's own
// en-US form is accepted (its symbol or code in its own place, split from the
// number by one plain, no-break or narrow no-break space where Intl puts one),
// or plain digits. Commas are valid only as thousands groups, and the first
// group cannot start with zero.
const numberPart = '([1-9]\\d{0,2}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?'
const anySpace = '[ \\u00a0\\u202f]'

function escapeAffix(text: string): string {
    return text
        .split('')
        .map(char => (/\s/.test(char) ? anySpace : char.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&')))
        .join('')
}

const plainPattern = new RegExp(`^(-?)${numberPart}$`)
const currencyPatterns = new Map<string, RegExp>()

function patternFor(currency: string): RegExp {
    const cached = currencyPatterns.get(currency)
    if (cached) return cached
    try {
        const parts = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).formatToParts(1234.5)
        const first = parts.findIndex(part => part.type === 'integer')
        const last = parts.findLastIndex(part => part.type === 'fraction')
        const join = (list: typeof parts) => list.map(part => part.value).join('')
        const before = escapeAffix(join(parts.slice(0, first)))
        const after = escapeAffix(join(parts.slice(last + 1)))
        const pattern = new RegExp(`^(-?)(?:${before})?${numberPart}(?:${after})?$`)
        currencyPatterns.set(currency, pattern)
        return pattern
    } catch {
        currencyPatterns.set(currency, plainPattern)
        return plainPattern
    }
}

// Without a currency, anything formatMoney can print for some currency parses.
const legacyPattern = new RegExp(
    `^(-?)(?:(?:[A-Z]{1,3}\\$|[$€£¥₹₩₽₺฿₫₪₱])|[A-Z]{3}${anySpace}+)?${numberPart}(?:${anySpace}+[A-Z]{3})?$`
)
let allCurrencyPatterns: RegExp[] | undefined

// Hermes (native) may lack Intl.supportedValuesOf; `legacyPattern` alone still
// parses every amount typed in the Books form.
function anyCurrencyPatterns(): RegExp[] {
    allCurrencyPatterns ??=
        typeof Intl.supportedValuesOf === 'function'
            ? Intl.supportedValuesOf('currency').map(patternFor)
            : []
    return allCurrencyPatterns
}

function matchMoney(text: string, currency?: string): RegExpExecArray | null {
    if (currency !== undefined) return patternFor(currency).exec(text)
    const direct = legacyPattern.exec(text)
    if (direct) return direct
    for (const pattern of anyCurrencyPatterns()) {
        const match = pattern.exec(text)
        if (match) return match
    }
    return null
}

// Lets callers tell malformed text from a well-formed amount over the stored maximum.
export function isWellFormedMoney(text: string, currency?: string): boolean {
    return matchMoney(text.trim(), currency) !== null
}

export function parseMoney(text: string, currency?: string): number | null {
    const match = matchMoney(text.trim(), currency)
    if (!match) return null
    const [, sign, whole, fraction = ''] = match
    // Integer math on the digits keeps the limit check exact; floats lose cents near 2^53.
    const cents = BigInt(whole.replace(/,/g, '') + fraction.padEnd(2, '0'))
    if (cents > BigInt(maxStoredAmount)) return null
    return sign === '-' && cents !== 0n ? -Number(cents) : Number(cents)
}

// A zero side of a line shows nothing, so a debit-only line has a blank credit cell.
export function amountText(cents: number, currency: string): string {
    return cents === 0 ? '' : formatMoney(cents, currency)
}

export function centsToText(cents: number): string {
    const digits = BigInt(Math.abs(cents)).toString().padStart(3, '0')
    const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',')
    return `${cents < 0 ? '-' : ''}${whole}.${digits.slice(-2)}`
}
