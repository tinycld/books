import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The credit memo help topic (checkpoint 3 started it; checkpoint 5 completes it, spec
// §3.10 Help): task-led, with the key map in Mac glyphs and links to its neighbours.
const { exists, frontmatter, body } = readHelpTopic('credit-memos')

const headings = [...body.matchAll(/^## (.*)$/gm)].map(m => m[1])

// The body under the first second-level heading that matches `heading`, up to the next one.
function section(heading: RegExp): string {
    const title = headings.find(h => heading.test(h))
    if (title === undefined) return ''
    const rest = body.slice(body.indexOf(`## ${title}\n`) + title.length + 4)
    const next = rest.search(/^## /m)
    return next < 0 ? rest : rest.slice(0, next)
}

const KEYS_HEADING = /keyboard|shortcut|\bkeys\b/i

describe('help/credit-memos.md', () => {
    it('exists with a title, a summary and tags', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
        expect(frontmatter).toMatch(/^tags:\s*\[\s*\S.*\]\s*$/m)
    })

    it.each([
        ['give a credit', /\bgive\b.*\bcredit\b/i],
        ['start from an invoice', /\bfrom an invoice\b/i],
        ["the customer's balance", /\bbalance\b/i],
        ['sales tax', /\bsales tax\b/i],
        ['edit and void', /\bedit\b.*\bvoid\b|\bvoid\b.*\bedit\b/i],
        ['cash basis', /\bcash basis\b/i],
        ['keys', KEYS_HEADING],
    ])('has a section for the task: %s', (_task, heading) => {
        expect(
            headings.some(h => heading.test(h)),
            `a heading matching ${heading}`
        ).toBe(true)
    })

    it.each([
        'Create credit memo',
        'Unapplied',
        'Credit amount',
        'For invoice',
    ])('names "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it.each([
        '⌘↵',
        '⌘⇧↵',
        '⌘S',
        'Esc',
        '⌘⌫',
        '⌘P',
        '⌥1',
        '⌥2',
    ])('lists the key %s in its key map', key => {
        expect(section(KEYS_HEADING)).toContain(key)
    })

    // A one-letter key stands alone: in a table cell, before a colon, or in backticks.
    it.each(['E', 'V', 'C', 'J', 'M'])('lists the key %s in its key map', key => {
        expect(section(KEYS_HEADING)).toMatch(new RegExp(`(^|[\\s|\`])${key}(?=[\\s|:\`]|$)`, 'm'))
    })

    it('writes keys with Mac glyphs only, no Ctrl', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/)
        expect(body).not.toMatch(/\b(Cmd|Alt|Shift)\b/)
    })

    // Sales reports checkpoint 3 (spec §3 "Help").
    it('links the sales reports section', () => {
        const links = [...body.matchAll(/\[([^\]]+)\]\(help:\/\/books:reports\)/g)].map(m => m[1])
        expect(links.some(text => /\bsales reports?\b|\bSales by\b/i.test(text))).toBe(true)
    })

    it('says a posted credit memo lowers both sales reports on its date', () => {
        const sentences = body.split(/(?<=[.!?])\s+/)
        expect(
            sentences.some(
                sentence =>
                    /\bposted credit memo\b/i.test(sentence) &&
                    /\blowers?\b/i.test(sentence) &&
                    /\bboth\b.*\bsales reports?\b|\bSales by Customer\b.*\bSales by Product\/Service\b/i.test(
                        sentence
                    ) &&
                    /\b(its|the memo['’]s|the credit memo['’]s) date\b/i.test(sentence)
            )
        ).toBe(true)
    })

    it.each([
        'help://books:invoices',
        'help://books:customer-pages',
        'help://books:sales-tax',
        // Write-off checkpoint 4: a credit memo for a price change or a return, a write-off
        // for a balance that will not be paid.
        'help://books:write-offs',
    ])('links %s', link => {
        expect(body).toContain(`(${link})`)
    })
})

// Refund receipt checkpoint 5 (refund receipt spec §3.12, §3.13 Help).
describe('help/credit-memos.md (refunds)', () => {
    it('names Refund credit with its key R on one line', () => {
        const line = body
            .split('\n')
            .find(l => /(^|[^\w⌘⌥⇧])R([^\w]|$)/.test(l) && /\bRefund credit\b/.test(l))
        expect(line, 'a line with R and Refund credit').toBeDefined()
    })

    it('names the Refunded row and status and the Unapplied credit row', () => {
        expect(body).toMatch(/\bRefunded\b/)
        expect(body).toContain('Unapplied credit')
    })

    it("names the void rule's text", () => {
        expect(body).toContain('Void the refund first')
    })

    it('names the correction rules: the refunded amount, the customer and the date', () => {
        const sentences = body.split(/(?<=[.!?])\s+/)
        const about = (pattern: RegExp) =>
            sentences.some(s => /\brefund/i.test(s) && pattern.test(s))
        expect(about(/\btotal\b/i), 'a sentence: the total cannot be below what is refunded').toBe(
            true
        )
        expect(about(/\bcustomer\b/i), 'a sentence: the customer cannot change').toBe(true)
        expect(about(/\bdate\b/i), 'a sentence: the date rule').toBe(true)
    })

    it('says nothing that claims a credit memo cannot be refunded yet', () => {
        expect(body).not.toMatch(/\bcannot yet\b[^.]*\brefund/i)
    })
})

// Apply credit spec §3.8 Help: the credit memo topic gains Apply to invoices.
describe('help/credit-memos.md (apply credit)', () => {
    it('names Apply to invoices', () => {
        expect(body).toContain('Apply to invoices')
    })
})
