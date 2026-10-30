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

describe('help/reports.md', () => {
    it('has the title "Run and customize a report" and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*Run and customize a report\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it.each([
        'Reports',
        'Trial Balance',
        'Add filter',
        'Apply',
        'Clear filters',
        'Customize',
        'Divide by 1000',
        'Without cents',
        'Show rows',
        'Reset to defaults',
        'Collapse all',
        'Custom',
        'As of',
    ])('mentions "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it.each(['copy the link', 'retained earnings'])('explains "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it('is linked from the Moving around Books topic', () => {
        expect(navigatingSource).toContain('help://books:reports')
    })
})
