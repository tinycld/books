import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// A missing topic reads as empty, so each assertion fails on its own phrase rather than the
// whole file failing to load.
function readHelp(name: string): string {
    const file = path.resolve(__dirname, '../help', name)
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

const source = readHelp('reports.md')
const navigatingSource = readHelp('navigating-books.md')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

// The body under `heading`, up to the next second-level heading.
function section(heading: string): string {
    const start = body.indexOf(`${heading}\n`)
    if (start < 0) return ''
    const rest = body.slice(start + heading.length)
    const next = rest.search(/^## /m)
    return next < 0 ? rest : rest.slice(0, next)
}

describe('help/reports.md', () => {
    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it.each([
        '## Open Books reports',
        '## Read the Trial Balance',
        '## Who sees Books reports',
        '## Build your own Books report',
    ])('has the heading "%s"', heading => {
        expect(body).toMatch(new RegExp(`^${heading}$`, 'm'))
    })

    it('links the core reports topic', () => {
        expect(body).toContain('(help://core:reports)')
    })

    it.each([
        'Rows',
        'Non-zero',
        'Active',
        'All',
        'Accounts',
        'retained earnings',
        'End of last month',
        'Custom',
        'Expand all',
    ])('names "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it('says that a user who has been offboarded has no share (D3)', () => {
        const sentences = section('## Who sees Books reports').split(/(?<=[.!?])\s+/)
        const offboarded = sentences.filter(sentence => /offboarded/i.test(sentence))
        expect(offboarded.length).toBeGreaterThan(0)
        expect(
            offboarded.some(
                sentence =>
                    /\b(no|not|none|never|loses?)\b/i.test(sentence) && /share/i.test(sentence)
            )
        ).toBe(true)
    })

    describe('the "Read the General Ledger" section', () => {
        const ledger = section('## Read the General Ledger')

        it('has the heading', () => {
            expect(body).toMatch(/^## Read the General Ledger$/m)
        })

        it.each([
            ['sections', /\bsections?\b/i],
            ['Beginning balance', /Beginning balance/],
            ["the running balance by the account's normal side", /normal side/i],
            ['Split', /\bSplit\b/],
            ['Rows', /\bRows\b/],
            ['Period', /\bPeriod\b/],
            ['All dates', /All dates/],
            ['sorting by a heading', /\bsort/i],
            ['folding a section', /\bfold/i],
        ])('names %s', (_name, phrase) => {
            expect(ledger).toMatch(phrase)
        })

        // "To open it" (opening the report) and "one section for each account" each
        // match a bare word; only one sentence that names both pins opening a section.
        it('says the sections are open, in one sentence', () => {
            const sentences = ledger.split(/(?<=[.!?])\s+/)
            expect(sentences.some(s => /\bsections?\b/i.test(s) && /\bopen\b/i.test(s))).toBe(true)
        })

        it('says the running balance follows the normal side in one sentence', () => {
            const sentences = ledger.split(/(?<=[.!?])\s+/)
            expect(sentences.some(s => /\bbalance\b/i.test(s) && /normal side/i.test(s))).toBe(true)
        })

        it('says a press on a column heading sorts the lines', () => {
            const sentences = ledger.split(/(?<=[.!?])\s+/)
            expect(sentences.some(s => /\bheading\b/i.test(s) && /\bsort/i.test(s))).toBe(true)
        })
    })

    describe('the "Read the Balance Sheet" section', () => {
        const sheet = section('## Read the Balance Sheet')
        const sentences = sheet.split(/(?<=[.!?])\s+/)
        const inOneSentence = (...phrases: RegExp[]) =>
            sentences.some(s => phrases.every(phrase => phrase.test(s)))

        it('has the heading, right after "Read the General Ledger"', () => {
            expect(body).toMatch(/^## Read the Balance Sheet$/m)
            const headings = [...body.matchAll(/^## .*$/gm)].map(m => m[0])
            const ledger = headings.indexOf('## Read the General Ledger')
            expect(ledger).toBeGreaterThanOrEqual(0)
            expect(headings[ledger + 1]).toBe('## Read the Balance Sheet')
        })

        it.each([
            ['Assets', /\bAssets\b/],
            ['Liabilities', /\bLiabilities\b/],
            ['Equity', /\bEquity\b/],
            ['Prior year', /Prior year/],
            ['Change', /\bChange\b/],
            ['% change', /% change/],
            ['Retained earnings', /Retained earnings/i],
            ['Net income', /Net income/i],
            ['the fiscal year', /fiscal year/i],
            ['Rows', /\bRows\b/],
            ['Non-zero', /Non-zero/],
            ['Active', /\bActive\b/],
        ])('names %s', (_name, phrase) => {
            expect(sheet).toMatch(phrase)
        })

        it("says every figure is a balance by the account's normal side, in one sentence", () => {
            expect(inOneSentence(/\bbalances?\b/i, /normal side/i)).toBe(true)
        })

        it('says Prior year is the same day a year earlier, in one sentence', () => {
            expect(inOneSentence(/Prior year/, /same day/i, /\byear (earlier|before)\b/i)).toBe(
                true
            )
        })

        it('says how the fiscal year splits Retained earnings and Net income', () => {
            expect(inOneSentence(/Retained earnings/i, /fiscal year/i)).toBe(true)
            expect(inOneSentence(/Net income/i, /fiscal year/i)).toBe(true)
        })

        it('says pressing an account opens its lines, in one sentence', () => {
            expect(inOneSentence(/\b(press|tap|click)\b/i, /\baccount\b/i, /\blines?\b/i)).toBe(
                true
            )
        })

        it('says why Total assets equals Total liabilities and equity', () => {
            expect(sheet).toMatch(/Total assets/i)
            expect(sheet).toMatch(/Total liabilities and equity/i)
            expect(
                inOneSentence(
                    /Total assets/i,
                    /Total liabilities and equity/i,
                    /\b(equals?|same|match(es)?)\b/i
                )
            ).toBe(true)
            // The reason: every posted entry balances (its debits equal its credits).
            expect(
                inOneSentence(/\b(because|since)\b/i, /\bentr(y|ies)\b/i, /\b(balances?|debits)\b/i)
            ).toBe(true)
        })
    })

    it('drops the Books shell: no Accrual or Cash section and no Show rows', () => {
        expect(body).not.toMatch(/^## Choose Accrual or Cash$/m)
        expect(body).not.toContain('Show rows')
    })
})

describe('help/navigating-books.md', () => {
    it('links the Books reports topic', () => {
        expect(navigatingSource).toContain('help://books:reports')
    })

    it('says Reports opens with only Books reports shown', () => {
        expect(navigatingSource).toContain('it opens Reports with only Books reports shown')
    })
})
