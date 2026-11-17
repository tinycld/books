import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The bill help topic `books:bills` (bill form spec §3.12, checkpoint 5): entering a bill,
// its two line tables, saving and posting, the read view's actions, the duplicate bill
// no. refusal, the Purchase lines setting and the key map of §3.2, in the Mac glyphs the help
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
    ['P', /\bPay bill\b/],
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
        'Purchase lines',
    ])('names %s', text => {
        expect(body).toContain(text)
    })

    // Expense form spec §3.10: the setting covers bills and expenses, so its old name is gone.
    it('names the setting Purchase lines, never Bill lines', () => {
        expect(body).not.toContain('Bill lines')
    })

    // Expense form spec §3.12: bills and expenses link each other.
    it('links the expenses topic', () => {
        expect(body).toContain('help://books:expenses')
    })

    // Attachments spec §3.9: the bill topic links the attachments topic.
    it('links the attachments topic', () => {
        expect(body).toContain('help://books:attachments')
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

    it('says only an admin changes Purchase lines', () => {
        expect(lineWith(/Purchase lines|Settings → Purchases/, /\badmin/i)).toBeDefined()
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

    // Pay bills spec §3.9, §3.12: the bill's balance, its badge, its payments and Pay bill.
    describe('paying a bill', () => {
        it.each([
            'Balance due',
            'Paid',
            'Partly paid',
            'Payments',
            'Pay bill',
        ])('names %s', text => {
            expect(body).toContain(text)
        })

        it('says Balance due is what is still open after the payments', () => {
            expect(
                lineWith(/Balance due/, /\bpayments?\b/i),
                'a line on Balance due and the payments it subtracts'
            ).toBeDefined()
        })

        it('says when the badge reads Paid and when Partly paid', () => {
            expect(lineWith(/\bPartly paid\b/, /\b(part|some)\b/i)).toBeDefined()
            expect(lineWith(/\bPaid\b/, /\b(in full|nothing|whole|all)\b/i)).toBeDefined()
        })

        it('says the Payments block lists the bill payments and opens them', () => {
            expect(
                lineWith(/\bPayments\b/, /\bbill payments?\b/i, /\bopen/i),
                'a line saying each listed bill payment opens'
            ).toBeDefined()
        })

        it('says a bill with posted payments is not voided until its payments are', () => {
            expect(
                lineWith(/\bvoid/i, /\bpayments?\b/i, /\b(first|until|before)\b/i),
                'a line saying the payments are voided or edited first'
            ).toBeDefined()
        })

        it('states the correction rule of a bill with payments', () => {
            expect(
                lineWith(/\b(edit|correct)/i, /\bpayments?\b/i, /\b(vendor|total)\b/i),
                'a line on editing a bill that payments pay (its vendor and total)'
            ).toBeDefined()
        })

        it('links the pay-bills topic', () => {
            expect(body).toContain('help://books:pay-bills')
        })
    })

    // Vendor credit spec §3.10, §3.12, §3.13: Credits applied, the credit rows of the
    // Payments block, the void and correction refusals, and the target of "Use a vendor
    // credit".
    describe('vendor credits applied to a bill', () => {
        it('names Credits applied above Balance due', () => {
            expect(
                lineWith(/\bCredits applied\b/, /\bBalance due\b/),
                'a line on Credits applied and Balance due'
            ).toBeDefined()
        })

        it('says the Payments block lists each applied vendor credit, which opens', () => {
            expect(
                lineWith(/\bPayments\b/, /\bvendor credits?\b/i, /\bopen/i),
                'a line saying the Payments block lists the vendor credits and opens them'
            ).toBeDefined()
        })

        it('says Remove on a credit row takes the credit off the bill', () => {
            expect(
                lineWith(/\bRemove\b/, /\bvendor credit|\bcredit\b/i),
                'a line on Remove on a credit row of the Payments block'
            ).toBeDefined()
        })

        it('gives the void refusal of a bill with credits in its words', () => {
            expect(body).toContain('Vendor credits are applied to this bill. Remove them first.')
        })

        it('gives the correction refusal of a bill with payments and credits in its words', () => {
            expect(body).toMatch(
                /Payments and credits of \$?[\d,]+\.\d\d are applied to this bill\. Its total cannot be below that\./
            )
        })

        it('links the vendor credits topic, the target of "Use a vendor credit"', () => {
            expect(body).toContain('help://books:vendor-credits')
            expect(
                lineWith(/\bvendor credit\b/i, /help:\/\/books:vendor-credits/),
                'the "use a vendor credit" line links the topic'
            ).toBeDefined()
        })
    })

    // Vendor credit spec §3.8: the Purchases card names all three forms.
    it('names the Bills, expenses and vendor credits card, not the old card title', () => {
        expect(body).toContain('Bills, expenses and vendor credits')
        expect(body).not.toContain('Bills and expenses card')
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
