// Money as typed text, with no import: forms/hosts.ts reaches this through
// lib/document-line-columns.ts and the generator loads hosts.ts in Node, where money.ts's
// logger (and with it React Native) cannot load. money.ts re-exports every name.

// Amounts are integer cents in memory and storage. PocketBase stores them as
// float64, which is exact only up to 2^53-1, so nothing above that is accepted.
export const maxStoredAmount = Number.MAX_SAFE_INTEGER

// The server's per-line limit (`maxAmount`, server/posting.go), below maxStoredAmount so
// one line alone always fits; tests/transfer.test.ts drift-tests it against the Go source.
export const maxLineAmount = 1_000_000_000_000_000

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

export function centsToText(cents: number): string {
    const digits = BigInt(Math.abs(cents)).toString().padStart(3, '0')
    const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',')
    return `${cents < 0 ? '-' : ''}${whole}.${digits.slice(-2)}`
}
