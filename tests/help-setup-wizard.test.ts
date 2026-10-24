import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve(__dirname, '../help/setup-wizard.md'), 'utf8')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

describe('help/setup-wizard.md', () => {
    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts with "To set up Books,"', () => {
        expect(body.trimStart()).toMatch(/^To set up Books,/)
    })

    it('covers the three parts', () => {
        expect(body).toContain('Business')
        expect(body).toContain('Ownership')
        expect(body).toContain('Starter chart')
        expect(body).toMatch(/fiscal year/i)
    })

    it('explains the case where the book already has accounts', () => {
        expect(body).toMatch(/already has/i)
        expect(body).toMatch(/not add the starter chart/i)
    })

    it('explains Start with an empty chart', () => {
        expect(body).toContain('Start with an empty chart')
    })

    it('links to the chart of accounts topic', () => {
        expect(body).toContain('(help://books:chart-of-accounts)')
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })

    it('writes shortcuts with Mac glyphs only', () => {
        expect(body).not.toMatch(/\b(Ctrl|Control|Cmd|Command|Alt|Option)\s*\+/i)
        expect(body).not.toMatch(/\bShift\s*\+/i)
    })
})
