import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The Purchase lists help topic (purchase-lists checkpoint 4, spec §3 "Help").

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('purchase-lists')

const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map(m => m[1])

// The key checks read only the "## Keys" section (to the next "## " heading or the end):
// a "/" of a help:// link or a number in the prose elsewhere must not count as a key.
const keysSection = /^## Keys\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1] ?? ''
const keysLines = keysSection.split('\n').map(line => line.trim())

// The key cell (the last cell) of each table row, split into its keys: "J or ↓" gives
// J and ↓, "1, 2, 3" gives 1, 2 and 3. The header and the "---" row are skipped.
const keyCells = keysLines
    .filter(line => line.startsWith('|'))
    .slice(2)
    .map(line => {
        const cells = line
            .split('|')
            .map(cell => cell.trim())
            .filter(cell => cell !== '')
        const keys = (cells.at(-1) ?? '').split(/\s*,\s*|\s+or\s+|\s+/)
        return new Set(keys.filter(key => key !== ''))
    })

describe('help/purchase-lists.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has its title and a summary in the frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*Purchase lists\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts "To find a bill or an expense,"', () => {
        expect(body.trim().startsWith('To find a bill or an expense,')).toBe(true)
    })

    it.each([
        ['tabs', /\btabs?\b/i],
        ['search', /\bsearch/i],
        ['filters', /\bfilters?\b/i],
        ['sort', /\bsort/i],
        ['the Category column', /\bcategory\b/i],
        ['row menus', /\brow menus?\b|\bMore actions\b/i],
        ['batch actions', /\bbatch actions?\b/i],
    ])('has a section for %s', (_name, pattern) => {
        const section = headings.find(heading => pattern.test(heading))
        expect(section, `a "## " heading for ${_name} among ${headings.join(' / ')}`).toBeDefined()
    })

    it('says that Category reads "Split" for a document with two or more lines', () => {
        expect(body).toMatch(/\bSplit\b/)
    })

    it('names the vendor picker', () => {
        expect(body).toMatch(/\bvendor picker\b|\bAll vendors\b/i)
    })

    it('has a Keys section with a key table', () => {
        expect(body).toMatch(/^## Keys\s*$/m)
        expect(keyCells.length).toBeGreaterThan(0)
    })

    it.each([
        ['search', ['/']],
        ['next row', ['J', '↓']],
        ['previous row', ['K', '↑']],
        ['open', ['↵', 'O']],
        ['tick', ['X', 'Space']],
        ['tick all', ['A']],
        ['new', ['N']],
        ['the tabs', ['1', '2', '3', '4', '5', '6']],
    ])('the key table names the %s keys', (_action, keys) => {
        const row = keyCells.find(cell => keys.every(key => cell.has(key)))
        expect(row, `a key cell with ${keys.join(', ')}`).toBeDefined()
    })

    it('names the key that leaves the search field (Escape)', () => {
        expect(keysSection).toMatch(/\bEsc(ape)?\b|⎋/)
    })

    it('writes keys with Mac glyphs only', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\b(Ctrl|Cmd|Alt)\b/i)
        expect(body).not.toMatch(/\bShift\b/)
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })
})

describe('the purchase document topics link to it', () => {
    it.each([
        'bills',
        'expenses',
        'pay-bills',
        'vendor-credits',
        'vendor-refunds',
    ])('help/%s.md holds help://books:purchase-lists', id => {
        const topic = readFileSync(path.join(helpDir, `${id}.md`), 'utf8')
        expect(topic).toContain('help://books:purchase-lists')
    })
})
