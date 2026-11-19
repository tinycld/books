import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The Sales lists help topic (sales-lists checkpoint 5, spec §3 "Help").

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('sales-lists')

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

const keySentences = keysLines
    .filter(line => !line.startsWith('|'))
    .join(' ')
    .split(/(?<=[.!?])\s+/)

describe('help/sales-lists.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has its title and a summary in the frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*Sales lists\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts "To find a sales transaction,"', () => {
        expect(body.trim().startsWith('To find a sales transaction,')).toBe(true)
    })

    it.each([
        ['the tabs', /\btabs?\b/i],
        ['search', /\bsearch/i],
        ['the status chips', /\bstatus chips?\b/i],
        ['the date range', /\bdate range\b/i],
        ['the customer picker', /\bcustomer picker\b|\bAll customers\b/i],
        ['sort', /\bsort/i],
        ['the row menu', /\brow menu\b|\bMore actions\b/i],
        ['Batch actions', /\bBatch actions\b/],
    ])('names %s', (_name, pattern) => {
        expect(body).toMatch(pattern)
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
        ['the tabs', ['1', '2', '3', '4', '5', '6', '7']],
    ])('the key table names the %s keys', (_action, keys) => {
        const row = keyCells.find(cell => keys.every(key => cell.has(key)))
        expect(row, `a key cell with ${keys.join(', ')}`).toBeDefined()
    })

    // Refund receipt checkpoint 5: the seventh tab.
    it('names seven tabs and the Refund receipts tab', () => {
        expect(body).toMatch(/\bseven tabs\b/i)
        expect(body).not.toMatch(/\bsix tabs\b/i)
        expect(body).toContain('Refund receipts')
    })

    it('says that beside a document the column moves with ↓ and ↑ and opens with ↵ or O', () => {
        const moves = keySentences.find(
            s => s.includes('↓') && s.includes('↑') && /\bmove/i.test(s)
        )
        expect(moves, 'a sentence: ↓ and ↑ move the column').toBeDefined()
        expect(moves).toMatch(/\bcolumn\b/i)
        const opens = keySentences.find(
            s => s.includes('↵') && /\bO\b/.test(s) && /\bopen/i.test(s)
        )
        expect(opens, 'a sentence: ↵ or O opens the focused row').toBeDefined()
    })

    it("says that J beside a document is the document's View journal entry", () => {
        const sentence = keySentences.find(
            s => /\bJ\b/.test(s) && /\bdocument\b/i.test(s) && s.includes('View journal entry')
        )
        expect(sentence, "a sentence: J is the document's View journal entry").toBeDefined()
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

// Write-off checkpoint 4 (write-off spec §3.6 Help): one paragraph on the Written off status
// and the row menu's Write off.
describe('help/sales-lists.md (write-offs)', () => {
    it('names a write-off or the Written off status', () => {
        expect(body).toMatch(/\bwrite-offs?\b|\bWritten off\b/i)
    })
})

describe('help/navigating-books.md', () => {
    const navigating = readFileSync(path.join(helpDir, 'navigating-books.md'), 'utf8')

    it('names Sales and links the Sales lists topic', () => {
        expect(navigating).toMatch(/\bSales\b/)
        expect(navigating).toContain('help://books:sales-lists')
    })
})
