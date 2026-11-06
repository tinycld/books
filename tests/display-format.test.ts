import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type CustomerAddress, formatAddressLines } from '../tinycld/books/lib/address'
import { formatMoney } from '../tinycld/books/lib/money'
import { formatDay } from '../tinycld/books/lib/register-range'
import { ratePercentText } from '../tinycld/books/lib/sales-tax'

type Vectors = {
    money: { cents: number; currency: string; text: string }[]
    day: { day: string; text: string }[]
    percent: { ppm: number; text: string }[]
    address: { address: CustomerAddress | null; lines: string[] }[]
}

const serverDir = join(__dirname, '..', 'server')
// server/display_format_test.go runs the same file, so a PDF prints what the screens show.
const vectors: Vectors = JSON.parse(
    readFileSync(join(serverDir, 'testdata', 'display_format_vectors.json'), 'utf8')
)
const symbols: Record<string, string> = JSON.parse(
    readFileSync(join(serverDir, 'currency_symbols.json'), 'utf8')
)

function intlPrefix(currency: string): string {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(1)
    const integer = parts.findIndex(part => part.type === 'integer')
    return parts
        .slice(0, integer)
        .map(part => part.value)
        .join('')
}

describe('display format vectors', () => {
    // it.each over an empty section passes, so an emptied section must fail here.
    it.each(['money', 'day', 'percent', 'address'] as const)('has rows in %s', section => {
        expect(vectors[section].length).toBeGreaterThan(0)
    })

    it.each(vectors.money)('formatMoney($cents, $currency)', ({ cents, currency, text }) => {
        expect(formatMoney(cents, currency)).toBe(text)
    })

    it.each(vectors.day)('formatDay($day)', ({ day, text }) => {
        expect(formatDay(day)).toBe(text)
    })

    it.each(vectors.percent)('ratePercentText($ppm)', ({ ppm, text }) => {
        expect(ratePercentText(ppm)).toBe(text)
    })

    it.each(vectors.address)('formatAddressLines %#', ({ address, lines }) => {
        expect(formatAddressLines(address)).toEqual(lines)
    })
})

describe('server/currency_symbols.json', () => {
    // The Go formatter prints "CODE + no-break space" for every currency not listed.
    it.each(Intl.supportedValuesOf('currency'))('%s matches Intl', code => {
        expect(symbols[code] ?? `${code} `).toBe(intlPrefix(code))
    })

    it('lists only currencies Intl knows', () => {
        const known = new Set(Intl.supportedValuesOf('currency'))
        expect(Object.keys(symbols).filter(code => !known.has(code))).toEqual([])
    })
})
