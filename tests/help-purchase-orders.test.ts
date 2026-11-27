import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { letterKey, lineWith, paragraphWith, readHelpTopic } from './help-topic'

// The purchase order help topic `books:purchase-orders` (purchase-orders spec §3.15,
// checkpoint 6): create an order, the two line tables, send and print, Copy to bill in
// full and in part, Received, Billed and Open and that they count posted bills, the
// automatic close, Close and Reopen (admin), the Open Purchase Orders report and the key
// list, in the Mac glyphs the help renderer translates. Then the topics that §3.15 updates.
const helpDir = path.resolve(__dirname, '../help')
const topic = readHelpTopic('purchase-orders')
const { exists, source, frontmatter, body } = topic

// The form keys (spec §3.2).
const FORM_KEYS = ['⌘↵', '⌘⇧↵', '⌘S', 'Esc', '⌘⌫', '⌘P', '⌥↵', '⌥P'] as const

// The read view's single-letter keys, each on a line with the action it runs (spec §3.2;
// Reopen is U, brief checkpoint 6 "TS names").
const READ_VIEW_LETTERS = [
    ['B', /\bCopy to bill\b/],
    ['E', /\bEdit\b/],
    ['C', /\bCopy\b/],
    ['X', /\bClose\b/],
    ['U', /\bReopen\b/],
] as const

describe('help/purchase-orders.md', () => {
    it('exists with its title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*Purchase orders\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it('explains the account lines and the product lines', () => {
        expect(paragraphWith(body, /\baccount lines?\b/i, /\bproduct lines?\b/i)).toBeDefined()
    })

    it('says how to send and print an order', () => {
        expect(lineWith(body, /\bSend\b/, /\bemail\b/i), 'a line on Send… by email').toBeDefined()
        expect(lineWith(body, /\bDownload PDF\b|\bPDF\b/), 'a line on the PDF').toBeDefined()
    })

    it('says Copy to bill makes a bill of every open line, or of the lines you choose', () => {
        expect(body).toContain('Copy to bill')
        expect(
            paragraphWith(body, /\bCopy to bill\b/, /\b(every|all)\b.*\bopen\b/i),
            'a paragraph on Copy to bill of every open line'
        ).toBeDefined()
        expect(
            paragraphWith(
                body,
                /\b(part|some|untick|fewer|less)\b/i,
                /\bbill\b/i,
                /\b(quantity|amount)\b/i
            ),
            'a paragraph on a bill of part of the order'
        ).toBeDefined()
        expect(body).toContain('Create bill')
    })

    it('says what Received, Billed and Open mean, and that they count posted bills', () => {
        for (const word of ['Received', 'Billed', 'Open']) {
            expect(body).toMatch(new RegExp(`\\b${word}\\b`))
        }
        expect(
            paragraphWith(body, /\bReceived\b/, /\bBilled\b/, /\bposted bills?\b/i),
            'a paragraph that ties Received and Billed to posted bills'
        ).toBeDefined()
        expect(
            paragraphWith(body, /\bdraft bills?\b/i, /\b(not|no|nothing|until)\b/i),
            'a paragraph saying a draft bill changes nothing on the order yet'
        ).toBeDefined()
    })

    it('says an order closes by itself when every line is received, and opens again', () => {
        expect(
            paragraphWith(
                body,
                /\bclos(es|ed)\b/i,
                /\bevery line\b|\ball (its )?lines\b/i,
                /\breceived\b/i
            ),
            'a paragraph on the automatic close'
        ).toBeDefined()
        expect(
            paragraphWith(body, /\bopens? again\b|\breopens?\b/i, /\bvoid/i),
            'a paragraph saying a void of its bill opens the order again'
        ).toBeDefined()
    })

    it('says only a Books admin closes and reopens an order by hand', () => {
        expect(
            lineWith(body, /\bClose\b/, /\badmin\b/i),
            'a line on Close and the admin'
        ).toBeDefined()
        expect(
            lineWith(body, /\bReopen\b/, /\badmin\b/i),
            'a line on Reopen and the admin'
        ).toBeDefined()
        expect(body).toMatch(/Purchase order \d+ is closed\. Reopen it to copy it to a bill\./)
    })

    it('names the Open Purchase Orders report and links the reports topic', () => {
        expect(body).toContain('Open Purchase Orders')
        expect(
            lineWith(body, /Open Purchase Orders/, /help:\/\/books:reports/),
            'the report line links help://books:reports'
        ).toBeDefined()
    })

    it('links the bills topic, the purchase lists and the vendor pages', () => {
        expect(body).toContain('help://books:bills')
        expect(body).toContain('help://books:purchase-lists')
        expect(body).toContain('help://books:vendor-pages')
    })

    it.each(FORM_KEYS)('names the key %s', key => {
        expect(body).toContain(key)
    })

    it.each(READ_VIEW_LETTERS)('names the read-view key %s with its action', (letter, action) => {
        expect(
            lineWith(body, letterKey(letter), action),
            `a line with ${letter} and its action`
        ).toBeDefined()
    })

    it('writes keys with Mac glyphs only', () => {
        expect(body).not.toMatch(/\b(Ctrl|Cmd|Alt|Option)\b/i)
        expect(body).not.toMatch(/\bShift\b/)
    })

    it('links only to topics that exist', () => {
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        expect(ids.length).toBeGreaterThan(0)
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})

// Purchase-orders spec §3.15 "Updated": each topic names its part of the orders and links
// the new topic.
describe('the topics that purchase orders change', () => {
    it.each([
        ['bills', /\bpurchase order\b/i],
        ['purchase-lists', /\bPurchase orders\b/],
        ['vendor-pages', /\bPurchase orders?\b/],
        ['reports', /Open Purchase Orders/],
        ['inventory', /\bon PO\b|\bOn purchase order\b/],
    ])('help/%s.md names it and links help://books:purchase-orders', (id, text) => {
        const { body: other } = readHelpTopic(id)
        expect(other).toMatch(text)
        expect(other).toContain('help://books:purchase-orders')
    })

    it('help/bills.md says a bill from a purchase order names its order', () => {
        const { body: bills } = readHelpTopic('bills')
        expect(
            lineWith(bills, /From purchase order/, /\bopen/i),
            'a line on the "From purchase order" link of the bill'
        ).toBeDefined()
    })

    it('help/purchase-lists.md names the Purchase orders tab with the Open column', () => {
        const { body: lists } = readHelpTopic('purchase-lists')
        expect(lineWith(lists, /\bPurchase orders\b/, /\bOpen\b/)).toBeDefined()
    })
})
