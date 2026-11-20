import { parseMoney } from './money'

// The whole search text as an amount in unsigned cents: a search finds money spent and
// received alike. Zero finds nothing, so it is no amount. Its own module because both
// bank-review.ts and bank-match.ts read it, and bank-review.ts already imports a value
// from bank-match.ts (a value import back would be a require cycle).
export function parseSearchAmount(text: string, currency: string): number | null {
    const cents = parseMoney(text.trim(), currency)
    if (cents === null || cents === 0) return null
    return Math.abs(cents)
}
