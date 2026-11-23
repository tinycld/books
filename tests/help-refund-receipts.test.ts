import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'
import { letterKey, lineWith, paragraphWith, readHelpTopic, sectionOf } from './help-topic'

// The refund receipt help topic (refund receipt spec §3.13 Help, checkpoint 5): task-led,
// the key map in Mac glyphs, links to the sales receipt and credit memo topics. The form's
// HelpIcon opens `books:refund-receipts`.
const { exists, frontmatter, body } = readHelpTopic('refund-receipts')

const headings = [...body.matchAll(/^#{2,3} (.*)$/gm)].map(m => m[1])

// The first sentence of each paragraph, so a task may lead a paragraph instead of a heading.
const leads = body
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim().split(/(?<=[.!?])\s/)[0] ?? '')
    .filter(lead => lead !== '' && !lead.startsWith('#'))

function namesTask(pattern: RegExp): boolean {
    return headings.some(h => pattern.test(h)) || leads.some(lead => pattern.test(lead))
}

const KEYS_HEADING = /keyboard|shortcut|\bkeys\b/i

// The body under the first heading that matches `heading`, up to the next heading.
function section(heading: RegExp): string {
    const title = headings.find(h => heading.test(h))
    if (title === undefined) return ''
    const start = body.search(
        new RegExp(`^#{2,3} ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm')
    )
    const rest = body.slice(start + title.length + 4)
    const next = rest.search(/^#{2,3} /m)
    return next < 0 ? rest : rest.slice(0, next)
}

describe('help/refund-receipts.md', () => {
    it('exists with a title, a summary, tags and an order', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*Refund receipts\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
        expect(frontmatter).toMatch(/^tags:\s*\[\s*\S.*\]\s*$/m)
        expect(frontmatter).toMatch(/^order:\s*\d+\s*$/m)
    })

    it('sorts after the credit memos topic', () => {
        const order = (topic: string) =>
            Number(/^order:\s*(\d+)/m.exec(readHelpTopic(topic).frontmatter)?.[1] ?? Number.NaN)
        expect(order('refund-receipts')).toBeGreaterThan(order('credit-memos'))
    })

    it.each([
        ['refund a sale', /\brefund\b.*\bsale\b/i],
        ['start from a sales receipt', /\bfrom a sales receipt\b/i],
        ['pay out a credit memo', /\bpay(s|ing)? out\b.*\bcredit memo\b/i],
        ['refund part of a credit', /\bpart of a credit\b/i],
        ['Refund from', /\bRefund from\b/],
        ['edit and void', /\bedit\b.*\bvoid\b|\bvoid\b.*\bedit\b/i],
        ['cash basis', /\bcash basis\b/i],
        ['when to use a credit memo instead', /\bcredit memo instead\b/i],
        ['keys', KEYS_HEADING],
    ])('names the task: %s, in a heading or a lead sentence', (_task, pattern) => {
        expect(namesTask(pattern), `a heading or lead sentence matching ${pattern}`).toBe(true)
    })

    it('says why a payout posts to Accounts receivable', () => {
        expect(body).toContain('Accounts receivable')
    })

    it('names the Balance line under Refund from', () => {
        expect(body).toMatch(/\bbalance\b/i)
    })

    it('names the two Post refusals of negative lines', () => {
        expect(body).toMatch(/\btaxable\b[^.]*\bbelow zero\b|\bbelow zero\b[^.]*\btaxable\b/i)
        expect(body).toMatch(/\bsubtotal\b[^.]*\bbelow zero\b|\bbelow zero\b[^.]*\bsubtotal\b/i)
    })

    it.each([
        '⌘↵',
        '⌘⇧↵',
        '⌘S',
        'Esc',
        '⌘P',
        '⌥1',
        '⌥2',
    ])('lists the key %s in its key map', key => {
        expect(section(KEYS_HEADING)).toContain(key)
    })

    // A one-letter key stands alone: in a table cell, before a colon, or in backticks.
    it.each(['E', 'V', 'C', 'J'])('lists the read-view key %s in its key map', key => {
        expect(section(KEYS_HEADING)).toMatch(new RegExp(`(^|[\\s|\`])${key}(?=[\\s|:\`]|$)`, 'm'))
    })

    it('writes keys with Mac glyphs only, no Ctrl', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/)
        expect(body).not.toMatch(/\b(Cmd|Alt|Shift)\b/)
    })

    it('names no hostname', () => {
        expect(body).not.toMatch(/https?:\/\//)
    })

    it.each(['help://books:sales-receipts', 'help://books:credit-memos'])('links %s', link => {
        expect(body).toContain(`(${link})`)
    })

    it("is in the manifest's help directory", () => {
        const directory = manifest.help?.directory
        expect(directory).toBe('help')
        expect(
            existsSync(path.resolve(__dirname, '..', directory ?? '', 'refund-receipts.md'))
        ).toBe(true)
    })
})

// Email and share spec §3.7 Help (checkpoint 5): a short Send section.
describe('help/refund-receipts.md (send)', () => {
    it('has a Send section that names Send… with its key S', () => {
        expect(body).toMatch(/^## Send\b.*$/m)
        const title = /^## (Send\b.*)$/m.exec(body)?.[1] ?? ''
        const send = sectionOf(body, title)
        expect(send).toContain('Send…')
        expect(lineWith(send, letterKey('S'), /Send…/), 'a line with S and Send…').toBeDefined()
    })
})

// Apply credit spec §3.8 Help: a credit memo partly applied pays out only what is left.
describe('help/refund-receipts.md (apply credit)', () => {
    it('says a refund pays out what is left', () => {
        expect(body).toContain('what is left')
    })
})

// Bank deposit spec §3.10 Help: where the topic names Undeposited funds, it links the
// Bank deposits topic.
describe('help/refund-receipts.md (bank deposits)', () => {
    it('links help://books:bank-deposits where it names Undeposited funds', () => {
        expect(
            paragraphWith(body, /Undeposited funds/, /help:\/\/books:bank-deposits\b/)
        ).toBeDefined()
    })
})
