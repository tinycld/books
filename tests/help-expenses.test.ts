import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The expense help topic `books:expenses` (expense form spec §3.12, checkpoint 4): when to
// record an expense instead of a bill, Paid from and its balance, payment method and Ref
// no., the two line tables, saving and posting, the read view's actions, the Purchase
// lines setting and the key map of §3.2, in the Mac glyphs the help renderer translates.
const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('expenses')

// The form keys (spec §3.2).
const FORM_KEYS = ['⌘↵', '⌘⇧↵', '⌘S', 'Esc', '⌥↵', '⌥P', '⌘⌫'] as const

// The read view's single-letter keys, each on a line with the action it runs.
const READ_VIEW_LETTERS = [
    ['E', /\bEdit\b/],
    ['V', /\bVoid\b/],
    ['C', /\bCopy\b/],
    ['J', /\bjournal entry\b/i],
] as const

const lines = body.split('\n')

function lineWith(...parts: RegExp[]) {
    return lines.find(line => parts.every(part => part.test(line)))
}

describe('help/expenses.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it('says when to record an expense instead of a bill', () => {
        expect(
            lineWith(/\bexpense\b/i, /\bbill\b/i, /\b(already paid|paid now|pay later|no bill)\b/i),
            'a line on an expense (paid now) against a bill (paid later)'
        ).toBeDefined()
    })

    it('explains Paid from and its balance', () => {
        expect(
            lineWith(/\bPaid from\b/, /\bbalance\b/i),
            'a line on Paid from and its balance'
        ).toBeDefined()
    })

    it.each([
        'Paid from',
        'Payment method',
        'Ref no.',
        'Save draft',
        'Post & new',
        'Void',
        'Copy',
        'Settings → Purchases',
        'Purchase lines',
    ])('names %s', text => {
        expect(body).toContain(text)
    })

    // Post and Edit are whole words of their own: "Post & new", "posted" and the
    // "Edit 1004" title do not count.
    it.each([
        ['Post', /\bPost\b(?! & new)/],
        ['Edit', /\bEdit\b(?! \d)/],
    ])('names %s on its own', (_text, word) => {
        expect(body).toMatch(word)
    })

    it('explains the duplicate check number refusal', () => {
        expect(
            lineWith(/\bcheck (no\.|number)/i, /\b(already|same|duplicate)\b/i),
            'a line on a check number that another expense already has'
        ).toBeDefined()
    })

    it('explains account lines and product lines', () => {
        expect(body).toMatch(/\baccount lines?\b/i)
        expect(body).toMatch(/\bproduct lines?\b/i)
    })

    it('explains a negative account line', () => {
        expect(
            lineWith(/\bnegative\b/i, /\baccount line/i),
            'a line naming a negative account line'
        ).toBeDefined()
    })

    it.each(FORM_KEYS)('names the key %s', key => {
        expect(body).toContain(key)
    })

    it.each(READ_VIEW_LETTERS)('names the read-view key %s with its action', (letter, action) => {
        const line = lines.find(
            l => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(l) && action.test(l)
        )
        expect(line, `a line with ${letter} and its action`).toBeDefined()
    })

    it.each([
        'help://books:bills',
        'help://books:vendors',
        'help://books:settings',
    ])('links %s', link => {
        expect(body).toContain(link)
    })

    it('links only to topics that exist', () => {
        expect(exists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
