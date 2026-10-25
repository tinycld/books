import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readHelp(name: string) {
    return readFileSync(path.resolve(__dirname, `../help/${name}.md`), 'utf8')
}

const source = readHelp('opening-balances')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

describe('help/opening-balances.md', () => {
    it('has a title, a summary and order 30 in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
        expect(frontmatter).toMatch(/^order:\s*30\s*$/m)
    })

    it.each(['Edit balances', 'Opening Balance Equity', 'Save draft'])('names "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it('contains no raw hostname', () => {
        expect(body).not.toMatch(/https?:\/\//)
        // Links and code are stripped first; the body has no legitimate dotted token.
        const prose = body.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/`[^`]*`/g, '')
        expect(prose).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)+\b/i)
    })

    it('describes the sign button and the More menu, and not a missing sign button', () => {
        expect(body).not.toContain('no sign button')
        expect(body).toContain('±')
        expect(body).toContain('More menu')
    })

    it('links only to existing help topics', () => {
        const ids = new Set(
            readdirSync(path.resolve(__dirname, '../help'))
                .filter(file => file.endsWith('.md'))
                .map(file => file.replace(/\.md$/, ''))
        )
        const files = ['opening-balances', 'chart-of-accounts', 'navigating-books']
        const links = files.flatMap(name =>
            [...readHelp(name).matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        )
        expect(links.length).toBeGreaterThan(0)
        for (const id of links) expect(ids.has(id)).toBe(true)
    })

    it.each(['chart-of-accounts', 'navigating-books'])('is linked from the %s topic', name => {
        expect(readHelp(name)).toContain('help://books:opening-balances')
    })
})
