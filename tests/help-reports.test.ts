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
