import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The estimate help topic, complete (checkpoint 4): task-led sections for statuses and
// Expired, accepting, converting to an invoice and undoing it, deleting, the PDF, and the
// key map in the Mac glyphs the help renderer translates (spec §3.2, §3.6 - §3.9).
const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('estimates')

// The form keys (spec §3.2).
const FORM_KEYS = ['⌘↵', '⌘⇧↵', '⌘S', '⌥I', '⌘⌫', '⌘P'] as const

// The read view's single-letter keys, each on a line with the action it runs.
const READ_VIEW_LETTERS = [
    ['C', /\bCopy\b/],
    ['I', /\bOpen invoice\b/],
] as const

function lineWith(...parts: RegExp[]) {
    return body.split('\n').find(line => parts.every(part => part.test(line)))
}

describe('help/estimates.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it.each([
        'Save & close',
        'Pending',
        'Accepted',
        'Rejected',
        'Closed',
        'Expired',
        'Convert to invoice',
        'Delete estimate',
        'Open invoice',
        'From estimate',
    ])('names %s', text => {
        expect(body).toContain(text)
    })

    it.each(FORM_KEYS)('names the key %s', key => {
        expect(body).toContain(key)
    })

    it('names Convert to invoice with ⌥I and Delete estimate with ⌘⌫ on one line each', () => {
        expect(lineWith(/⌥I/, /Convert to invoice/), 'a line with ⌥I and Convert').toBeDefined()
        expect(lineWith(/⌘⌫/, /Delete estimate/), 'a line with ⌘⌫ and Delete').toBeDefined()
    })

    it.each(READ_VIEW_LETTERS)('names the read-view key %s with its action', (letter, action) => {
        const line = body
            .split('\n')
            .find(l => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(l) && action.test(l))
        expect(line, `a line with ${letter} and its action`).toBeDefined()
    })

    // Spec §3.7: deleting the draft invoice or voiding the posted one sends the estimate
    // back to Accepted (with an accepted date) or Pending.
    it('says how to undo a conversion and where the estimate goes back to', () => {
        expect(body).toMatch(/\bundo\b/i)
        expect(
            lineWith(/delet\w*[^\n]*draft invoice/i, /\bvoid/i, /\bAccepted\b/, /\bPending\b/),
            'a paragraph naming delete draft invoice, void, Accepted and Pending'
        ).toBeDefined()
    })

    // estimate-public-link spec §3.1, §3.5: the customer link end to end.
    it('has a section on sharing an estimate with the customer', () => {
        expect(body).toMatch(/^## Share an estimate with your customer$/m)
        const section =
            body.split(/^## Share an estimate with your customer$/m)[1]?.split(/^## /m)[0] ?? ''
        for (const text of ['Copy customer link', '⌥L', 'Accept', 'Decline', 'Reason']) {
            expect(section, text).toContain(text)
        }
        expect(section).toContain('until the estimate is deleted')
        expect(
            lineWith(/⌥L/, /Copy customer link/),
            'a line with ⌥L and Copy customer link'
        ).toBeDefined()
    })

    it('links the invoices topic', () => {
        expect(body).toContain('(help://books:invoices)')
    })

    it('links only to topics that exist', () => {
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('has no Ctrl or Alt keyboard text and no image line', () => {
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
        expect(body).not.toMatch(/!\[[^\]]*\]\(/)
    })
})
