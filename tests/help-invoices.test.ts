import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('invoices')

// The spec's key map (§3.1) in the Mac glyphs the help renderer translates.
const INVOICE_KEYS = [
    '⌘↵',
    '⌘⇧↵',
    '⌘S',
    'Esc',
    '⌘⌫',
    '⌥↵',
    '⌥T',
    '⌥S',
    '⌥5',
    '⌘⌥⌫',
    '⌘⌥↑',
    '⌘⌥↓',
    '⌘⌥D',
    '⌥M',
    '⌥1',
    '⌥2',
    '⌘P',
] as const

// The read view's single-letter keys, each on a line with the action it runs.
const READ_VIEW_LETTERS = [
    ['E', /\bEdit\b/],
    ['V', /\bVoid\b/],
    ['C', /\bCopy\b/],
    ['J', /journal entry/i],
] as const

describe('help/invoices.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has a title and a summary in its frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it.each(INVOICE_KEYS)('names the key %s', key => {
        expect(topicExists).toBe(true)
        expect(body).toContain(key)
    })

    it.each(READ_VIEW_LETTERS)('names the read-view key %s with its action', (letter, action) => {
        const line = body
            .split('\n')
            .find(l => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(l) && action.test(l))
        expect(line, `a line with ${letter} and its action`).toBeDefined()
    })

    it('says the Customer field has focus when the form opens', () => {
        expect(body).toContain('the Customer field has focus when the form opens')
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('has no hand-written hostname', () => {
        expect(topicExists).toBe(true)
        const withoutTokens = body.replace(/\{\{server-host\}\}/g, '')
        expect(withoutTokens).not.toMatch(
            /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app)\b/i
        )
    })

    it('has no image line', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/!\[[^\]]*\]\(/)
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it.each([
        'customers.md',
        'products-services.md',
        'sales-tax.md',
        'documents.md',
    ])('is linked from %s', name => {
        expect(readFileSync(path.join(helpDir, name), 'utf8')).toContain('help://books:invoices')
    })
})
