import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The vendor credit help topic `books:vendor-credits` (vendor credit spec §3.13,
// checkpoint 5): when to use a vendor credit instead of a negative bill line, the band and
// its duplicate refusal, the lines, saving and posting, Apply to bills and Remove, the
// read view's actions, attachments, the Purchase lines setting, the cash basis and the
// keys of §3.2 and the apply dialog, in the Mac glyphs the help renderer translates.
const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('vendor-credits')

// The form keys (spec §3.2) and the dialog's ⌥↵.
const KEYS = ['⌘↵', '⌘⇧↵', '⌘S', '⌘⌫', '⌥↵', '⌥P'] as const

// The read view's single-letter keys, each on a line with the action it runs.
const READ_VIEW_LETTERS = [
    ['E', /\bEdit\b/],
    ['V', /\bVoid\b/],
    ['C', /\bCopy\b/],
    ['J', /\bjournal entry\b/i],
    ['A', /\bApply to bills\b/],
] as const

// Spec §3.13 cross-links: bills ↔ vendor credits ↔ pay bills, vendors, settings, reports.
const LINKED = ['bills', 'pay-bills', 'vendors', 'settings', 'reports'] as const

const lines = body.split('\n')

function lineWith(...parts: RegExp[]) {
    return lines.find(line => parts.every(part => part.test(line)))
}

describe('help/vendor-credits.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it('says when to use a vendor credit instead of a negative bill line', () => {
        expect(
            lineWith(/\bvendor credit\b/i, /\bnegative\b/i, /\bbill\b/i),
            'a line on a vendor credit against a negative line on a bill'
        ).toBeDefined()
        expect(
            lineWith(/\breturn/i, /\bovercharge/i, /\bcredit note\b/i),
            'a line naming a return, an overcharge and a credit note'
        ).toBeDefined()
    })

    it.each([
        'Vendor',
        'Credit date',
        "Vendor's credit no.",
        'Save draft',
        'Post & new',
        'Apply to bills',
        'Remove',
        'Copy',
        'Purchase lines',
    ])('names %s', text => {
        expect(body).toContain(text)
    })

    // Post and Edit are whole words of their own: "Post & new", "posted" and the
    // "Edit 1002" title do not count.
    it.each([
        ['Post', /\bPost\b(?! & new)/],
        ['Edit', /\bEdit\b(?! \d)/],
    ])('names %s on its own', (_text, word) => {
        expect(body).toMatch(word)
    })

    it("gives the duplicate vendor's credit no. refusal in its words", () => {
        expect(
            lineWith(/already has credit no\./),
            'a line with "<Vendor> already has credit no. <no.> (Vendor credit <n>)."'
        ).toBeDefined()
    })

    it('explains account lines and product lines', () => {
        expect(body).toMatch(/\baccount lines?\b/i)
        expect(body).toMatch(/\bproduct lines?\b/i)
    })

    it('says what posting does to Accounts payable', () => {
        expect(lineWith(/\bpost/i, /Accounts payable/)).toBeDefined()
    })

    describe('Apply to bills', () => {
        it('says the dialog spreads the credit over the oldest bills first', () => {
            expect(
                lineWith(/\boldest\b/i, /\b(first|due)\b/i),
                'a line on the oldest due bills first'
            ).toBeDefined()
        })

        it('names the apply date and that it cannot be before the credit date', () => {
            expect(body).toMatch(/\bApply date\b/i)
            expect(
                lineWith(/\bapply date\b/i, /\bcredit date\b/i),
                'a line on the apply date and the credit date'
            ).toBeDefined()
        })

        it('says part of a credit can stay unapplied', () => {
            expect(
                lineWith(/\b(part|partly|some)\b/i, /\bunapplied\b/i),
                'a line on applying part of the credit'
            ).toBeDefined()
        })

        it('says Remove puts the credit back on the bill and the credit', () => {
            expect(
                lineWith(/\bRemove\b/, /\bbill\b/i, /\b(balance|unapplied)\b/i),
                'a line on Remove raising the bill balance and the unapplied credit again'
            ).toBeDefined()
        })
    })

    it('says an applied credit is removed from its bills before it is voided', () => {
        expect(
            lineWith(/\bVoid/, /\bapplied\b/i, /\bremove/i),
            'a line on voiding an applied credit only after Remove'
        ).toBeDefined()
    })

    it('names attachments', () => {
        expect(body).toMatch(/\battach(ment|ments|ed)?\b/i)
    })

    it('explains the Purchase lines setting under Settings → Purchases', () => {
        expect(lineWith(/Purchase lines/, /Settings → Purchases/)).toBeDefined()
    })

    it('explains the cash basis in a paragraph that names applying', () => {
        expect(
            lineWith(/\bcash basis\b/i, /\bappl(y|ied|ies)\b/i),
            'a paragraph on the cash basis and applying'
        ).toBeDefined()
    })

    it.each(KEYS)('names the key %s', key => {
        expect(body).toContain(key)
    })

    it.each(READ_VIEW_LETTERS)('names the read-view key %s with its action', (letter, action) => {
        const line = lines.find(
            l => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(l) && action.test(l)
        )
        expect(line, `a line with ${letter} and its action`).toBeDefined()
    })

    it('writes keys with Mac glyphs only, never Ctrl or Alt text', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it.each(LINKED)('links the %s topic, which exists', id => {
        expect(body).toContain(`help://books:${id}`)
        expect(existsSync(path.join(helpDir, `${id}.md`)), `help/${id}.md`).toBe(true)
    })

    it('links only to topics that exist', () => {
        expect(exists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
