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

    describe('the "Read the Journal" section', () => {
        const journal = section('## Read the Journal')
        const sentences = journal.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('has the heading, after "Read the General Ledger"', () => {
            expect(body).toMatch(/^## Read the Journal$/m)
            expect(body.indexOf('## Read the Journal\n')).toBeGreaterThan(
                body.indexOf('## Read the General Ledger\n')
            )
        })

        it('says each posted entry is a block headed by its number and type', () => {
            expect(oneSentence(/\bblocks?\b/i, /\bentry\b/i)).toBe(true)
            expect(oneSentence(/\bnumber\b/i, /\btype\b/i)).toBe(true)
            expect(journal).toContain('JE-41 · Journal entry')
            expect(journal).toContain('TR-7 · Transfer')
        })

        it.each([
            ['the date', /\bdate\b/i],
            ['Account', /\bAccount\b/],
            ['Name', /\bName\b/],
            ['Description', /\bDescription\b/],
            ['Debit', /\bDebit\b/],
            ['Credit', /\bCredit\b/],
        ])('names the line column %s', (_name, phrase) => {
            expect(journal).toMatch(phrase)
        })

        it("says each block's total row and the report's Total have equal Debit and Credit", () => {
            expect(oneSentence(/\bblock\b/i, /\btotal\b/i, /Debit/, /Credit/, /\bequal/i)).toBe(
                true
            )
            expect(oneSentence(/\bTotal\b/, /\breport\b/i, /\bequal/i)).toBe(true)
        })

        it('says only posted entries show, never drafts, and a void shows with its void reversal', () => {
            expect(oneSentence(/\bposted\b/i, /\bshow/i)).toBe(true)
            expect(oneSentence(/\bdrafts?\b/i, /\b(no|not|never)\b/i)).toBe(true)
            expect(oneSentence(/\bvoided entry\b/i, /\bvoid reversal\b/i, /\bboth\b/i)).toBe(true)
        })

        it('names the Period chip with All dates', () => {
            expect(journal).toMatch(/\bPeriod\b/)
            expect(journal).toContain('All dates')
            expect(journal).toContain('Custom')
        })

        it('says a press on a column heading sorts the lines inside each block', () => {
            expect(oneSentence(/\bheading\b/i, /\bsort/i, /\bblocks?\b/i)).toBe(true)
        })

        it('says a press on a block heading folds it, and names Collapse all and Expand all', () => {
            expect(oneSentence(/\bfold/i, /\bblock/i)).toBe(true)
            expect(journal).toContain('Collapse all')
            expect(journal).toContain('Expand all')
        })

        it('says a long period loads more blocks as you scroll', () => {
            expect(oneSentence(/\bload/i, /\bscroll/i)).toBe(true)
        })

        it('says how a line wraps on a phone and on a tablet', () => {
            expect(oneSentence(/\bphone\b/i, /\bthree lines\b/i)).toBe(true)
            expect(oneSentence(/\btablet\b/i, /\btwo lines\b/i)).toBe(true)
        })
    })

    it('"Who sees Books reports" names the Journal with the Trial Balance and the General Ledger', () => {
        const sentences = section('## Who sees Books reports').split(/(?<=[.!?])\s+/)
        expect(
            sentences.some(
                sentence =>
                    sentence.includes('Trial Balance') &&
                    sentence.includes('General Ledger') &&
                    /\bJournal\b/.test(sentence)
            )
        ).toBe(true)
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
