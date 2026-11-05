import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    groupPpm,
    groupTax,
    MAX_RATE_PPM,
    PPM_PER_PERCENT,
    parseRatePercent,
    ratePercentText,
    taxOn,
} from '../tinycld/books/lib/sales-tax'

type Vectors = {
    taxOn: { cents: number; ppm: number; tax: number }[]
    groupTax: { cents: number; ppms: number[]; taxes: number[] }[]
    parse: { text: string; ppm: number | null }[]
    text: { ppm: number; text: string }[]
}

// The Go mirror (server/sales_tax_math_test.go) runs the same file, so the two stay equal.
const vectors: Vectors = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'sales_tax_vectors.json'), 'utf8')
)

describe('sales tax math', () => {
    it('names the ppm scale', () => {
        expect(PPM_PER_PERCENT).toBe(10_000)
        expect(MAX_RATE_PPM).toBe(1_000_000)
    })

    // it.each over an empty section runs nothing and passes, so an emptied section must fail here.
    // A renamed section is undefined, and the file then fails at collection.
    it.each([
        'taxOn',
        'groupTax',
        'parse',
        'text',
    ] as const)('has rows in the %s vector section', section => {
        expect(vectors[section].length).toBeGreaterThan(0)
    })

    // toBe compares with Object.is, so a -0 result fails against a 0 row.
    it.each(vectors.taxOn)('taxOn($cents, $ppm) is $tax', ({ cents, ppm, tax }) => {
        expect(taxOn(cents, ppm)).toBe(tax)
    })

    it.each(vectors.groupTax)('groupTax($cents, $ppms) is $taxes', ({ cents, ppms, taxes }) => {
        expect(groupTax(cents, ppms)).toEqual(taxes)
    })

    it.each(vectors.parse)('parseRatePercent("$text") is $ppm', ({ text, ppm }) => {
        expect(parseRatePercent(text)).toBe(ppm)
    })

    it.each(vectors.text)('ratePercentText($ppm) is $text', ({ ppm, text }) => {
        expect(ratePercentText(ppm)).toBe(text)
    })

    it('sums a group and shows its combined percent', () => {
        expect(groupPpm([29000, 10000, 48100])).toBe(87100)
        expect(ratePercentText(87100)).toBe('8.71%')
    })

    it.each([0, 1, 7500, 88750, 999999, 1000000])('parses its own text back for %i ppm', ppm => {
        expect(parseRatePercent(ratePercentText(ppm))).toBe(ppm)
    })

    it('refuses a fractional cent amount', () => {
        expect(() => taxOn(1.5, 10000)).toThrow(RangeError)
    })

    it('refuses an amount past 2^53-1', () => {
        expect(() => taxOn(2 ** 53, 10000)).toThrow(RangeError)
    })

    it('refuses a rate over 100%', () => {
        expect(() => taxOn(100, 1000001)).toThrow(RangeError)
    })
})
