import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The vendor refund help topic `books:vendor-refunds` (vendor refund spec §3.12, checkpoint
// 5 and its carry items): when to record a vendor refund, recording the vendor credit
// first, the steps of the form, one refund over several credits, saving and posting, what
// posting does, Edit (a correction draft) and Void, the stale-draft notice, a draft refund
// left on a corrected credit, the cash basis and every key of §3.2, in the Mac glyphs the
// help renderer translates. The refund form's HelpIcon opens this topic.
const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('vendor-refunds')
const credits = readHelpTopic('vendor-credits')

// The form keys of spec §3.2.
const FORM_KEYS = ['⌘↵', '⌘⇧↵', '⌘S', 'Esc', '⌘⌫', '⌥⌫', '⌥A', '⌥↵'] as const

// The single-letter keys of the read view and of the vendor credit read view, each on a
// line with the action it runs.
const LETTER_KEYS = [
    ['E', /\bEdit\b/],
    ['V', /\bVoid\b/],
    ['J', /\bjournal entry\b/i],
    ['R', /\bRecord refund\b/],
] as const

// Spec §3.12 cross-links: vendor credits, vendors, banking, reports.
const LINKED = ['vendor-credits', 'vendors', 'banking', 'reports'] as const

const lines = body.split('\n')

function lineWith(...parts: RegExp[]) {
    return lines.find(line => parts.every(part => part.test(line)))
}

function orderOf(frontmatterText: string): number {
    return Number(/^order:\s*(\d+)\s*$/m.exec(frontmatterText)?.[1] ?? Number.NaN)
}

describe('help/vendor-refunds.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it('has tags and sorts after the vendor credits topic', () => {
        expect(frontmatter).toMatch(/^tags:\s*\[.*\S.*\]\s*$/m)
        expect(orderOf(frontmatter)).toBeGreaterThan(orderOf(credits.frontmatter))
    })

    it('says when to record one: the vendor sends money back for a credit, in place of applying it to a bill', () => {
        expect(
            lineWith(/\bvendor refund\b/i, /\bback\b/i, /\bvendor credit\b/i),
            'a line on the vendor sending money back for a vendor credit'
        ).toBeDefined()
        expect(
            lineWith(
                /\b(instead of|in place of|rather than)\b/i,
                /\bappl(y|ying)\b/i,
                /\bbills?\b/i
            ),
            'a line on refunding a credit in place of applying it to a bill'
        ).toBeDefined()
    })

    it('says to record the vendor credit first', () => {
        expect(
            lineWith(/\bvendor credit\b/i, /\bfirst\b/i),
            'a line on recording the vendor credit first'
        ).toBeDefined()
    })

    it.each([
        'Vendor',
        'Refund date',
        'Payment method',
        'Reference no.',
        'Refunded to',
        'Amount refunded',
        'Refund all',
        'Clear refunds',
        'Memo',
    ])('names the field or control %s', text => {
        expect(body).toContain(text)
    })

    it('says Refunded to lists bank, credit card and Undeposited funds accounts', () => {
        expect(
            lineWith(/Refunded to/, /\bbank\b/i, /\bcredit card\b/i, /Undeposited funds/),
            'a line on the Refunded to accounts'
        ).toBeDefined()
    })

    it("says each credit's Refund cell takes what is refunded of it", () => {
        expect(
            lineWith(/\bRefund\b/, /\b(cell|column)\b/i, /\bcredits?\b/i),
            'a line on the Refund cell of each listed credit'
        ).toBeDefined()
    })

    it('says one refund can cover several vendor credits', () => {
        expect(
            lineWith(
                /\b(one|a single) (vendor )?refund\b/i,
                /\b(several|more than one|many|two or more)\b/i,
                /\bcredits\b/i
            ),
            'a line on one refund over several credits'
        ).toBeDefined()
    })

    it.each(['Save draft', 'Post & new'])('names %s', text => {
        expect(body).toContain(text)
    })

    it('names Post on its own', () => {
        expect(body).toMatch(/\bPost\b(?! & new)/)
    })

    it('says what posting does to Accounts payable and the account', () => {
        expect(
            lineWith(/\bpost/i, /Accounts payable/),
            'a line on posting and Accounts payable'
        ).toBeDefined()
        expect(
            lineWith(/\bpost/i, /Refunded to|\baccount the (money|refund)\b/i),
            'a line on posting into the Refunded to account'
        ).toBeDefined()
    })

    it("says posting lowers each credit's unapplied credit", () => {
        expect(
            lineWith(/\bunapplied\b/i, /\b(lower|lowers|goes down|go down|less)\b/i),
            "a line on the credits' unapplied credit going down"
        ).toBeDefined()
    })

    describe('Edit, the correction draft and Void', () => {
        it('names Edit and Void on their own', () => {
            expect(body).toMatch(/\bEdit\b(?! vendor refund \d)/)
            expect(body).toMatch(/\bVoid\b/)
        })

        it('says an edit keeps the number', () => {
            expect(
                lineWith(/\bEdit\b/, /\b(same|its|the) number\b/i),
                'a line on Edit keeping the number'
            ).toBeDefined()
        })

        it('says the vendor of an edit cannot change', () => {
            expect(
                lineWith(/\bvendor\b/i, /\b(cannot|can't|can not) (be )?change/i),
                'a line on the vendor that cannot change'
            ).toBeDefined()
        })

        it('says Save draft on an edit keeps a draft that replaces the original only when it posts', () => {
            expect(
                lineWith(/\bSave draft\b/, /\breplaces?\b/i, /\bpost/i, /\boriginal\b/i),
                'a line on a saved correction draft replacing the original only at post'
            ).toBeDefined()
        })

        it('says Void posts a reversing entry and the credits are unapplied again', () => {
            expect(
                lineWith(/\bVoid\b/, /\breversing entry\b/i),
                'a line on Void and the reversing entry'
            ).toBeDefined()
            expect(
                lineWith(/\bunapplied again\b/i),
                'a line on the credits being unapplied again'
            ).toBeDefined()
        })

        it('names the stale-draft notice and its only action, Delete draft', () => {
            expect(body).toContain('This vendor refund cannot be edited')
            expect(
                lineWith(/This vendor refund cannot be edited/, /\b(voided|replaced)\b/i),
                'a line on the notice of a draft whose original was voided or replaced'
            ).toBeDefined()
            expect(
                lineWith(/This vendor refund cannot be edited/, /Delete draft/),
                'a line on Delete draft as the notice’s only action'
            ).toBeDefined()
        })
    })

    describe('a draft refund on a corrected vendor credit', () => {
        it('says an edit of a vendor credit moves only its posted refunds', () => {
            expect(
                lineWith(/\bposted\b/i, /\bdraft\b/i, /\bvendor credit\b/i, /\b(edit|correct)/i),
                'a line on a vendor credit edit moving posted refunds and leaving drafts'
            ).toBeDefined()
        })

        it('gives the refusal of posting that draft in its words', () => {
            expect(body).toMatch(/Vendor credit \S+ is not open\. Clear it to continue\./)
        })

        it('says to clear that row or delete the draft, and record the refund on the edit', () => {
            expect(
                lineWith(/\bclear\b/i, /\bdelete\b/i),
                'a line on clearing the row or deleting the draft'
            ).toBeDefined()
        })
    })

    it('explains the cash basis in a paragraph that names the refund', () => {
        expect(
            lineWith(/\bcash basis\b/i, /\brefund/i),
            'a paragraph on the cash basis and the refund'
        ).toBeDefined()
    })

    it.each(FORM_KEYS)('names the form key %s', key => {
        expect(exists).toBe(true)
        expect(body).toContain(key)
    })

    it.each(LETTER_KEYS)('names the key %s with its action', (letter, action) => {
        const line = lines.find(
            l => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(l) && action.test(l)
        )
        expect(line, `a line with ${letter} and its action`).toBeDefined()
    })

    it('writes keys with Mac glyphs only, never Ctrl, Cmd or Alt text', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bCmd\b/i)
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
