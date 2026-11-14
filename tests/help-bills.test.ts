import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The bill help topic `books:bills` (bill form spec §3.12, checkpoint 5): entering a bill,
// its two line tables, saving and posting, the read view's actions, the duplicate bill
// no. refusal, the Bill lines setting and the key map of §3.2, in the Mac glyphs the help
// renderer translates.
const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('bills')

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

describe('help/bills.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it.each([
        'Vendor',
        'Bill date',
        'Due date',
        'Terms',
        "Vendor's bill no.",
        'Save draft',
        'Post',
        'Post & new',
        'Edit',
        'Void',
        'Copy',
        'Settings → Purchases',
        'Bill lines',
    ])('names %s', text => {
        expect(body).toContain(text)
    })

    it('explains account lines and product lines', () => {
        expect(body).toMatch(/\baccount lines?\b/i)
        expect(body).toMatch(/\bproduct lines?\b/i)
    })

    it('says a negative account line records a vendor discount', () => {
        expect(
            lineWith(/\bnegative\b/i, /\baccount line/i, /\bdiscount/i),
            'a line naming a negative account line and a discount'
        ).toBeDefined()
    })

    it('explains the duplicate bill no. refusal', () => {
        expect(
            lineWith(/\bbill no\./i, /\b(already|same|duplicate)\b/i),
            "a line on a vendor's bill no. that another bill already has"
        ).toBeDefined()
    })

    it('says only an admin changes Bill lines', () => {
        expect(lineWith(/Bill lines|Settings → Purchases/, /\badmin/i)).toBeDefined()
    })

    it('says a hidden table still shows on a bill that has its lines', () => {
        expect(
            lineWith(/\b(hid(e|es|den)|not shown|turned off|leaves out)\b/i, /\bstill\b/i),
            'a line saying a hidden table still shows on a bill with its lines'
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

    it('names Delete draft with ⌘⌫ on one line', () => {
        expect(lineWith(/⌘⌫/, /Delete draft/)).toBeDefined()
    })

    // Human decision 2026-11-13 (spec §3.6): Delete draft is in the More menu at every width;
    // the wide bar's buttons are Cancel, Save draft, Post & new and Post.
    it('places Delete draft in More, never as a button of the wide bar', () => {
        expect(
            lineWith(/Delete draft/, /\bMore\b/),
            'a sentence or list item that puts Delete draft in More'
        ).toBeDefined()
        const barLines = lines.filter(
            l => /Delete draft/.test(l) && /\b(bar|wide|buttons?)\b/i.test(l)
        )
        for (const line of barLines) {
            expect(line, 'a bar line that names Delete draft names it in More').toMatch(/\bMore\b/)
        }
    })

    it('links only to topics that exist', () => {
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
