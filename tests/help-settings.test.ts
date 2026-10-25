import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve(__dirname, '../help/settings.md'), 'utf8')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

describe('help/settings.md', () => {
    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('explains how to close the books through a date', () => {
        expect(body).toContain('To close the books through a date,')
    })

    it('explains how to let someone post into a closed period', () => {
        expect(body).toContain('To let someone post into a closed period,')
    })

    it('covers company details, numbering and access levels', () => {
        expect(body).toMatch(/company details/i)
        expect(body).toMatch(/numbering/i)
        expect(body).toMatch(/access levels?/i)
    })

    it('links to the chart of accounts and setup wizard topics', () => {
        expect(body).toContain('(help://books:chart-of-accounts)')
        expect(body).toContain('(help://books:setup-wizard)')
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
