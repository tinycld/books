import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The write-off help topic (write-off spec §3.6 Help, checkpoint 4): task-led, the key map in
// Mac glyphs, links to the invoice and credit memo topics.
const { exists, frontmatter, body } = readHelpTopic('write-offs')

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

describe('help/write-offs.md', () => {
    it('exists with a title, a summary, tags, and an order after the credit memos topic', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
        expect(frontmatter).toMatch(/^tags:\s*\[\s*\S.*\]\s*$/m)
        const credit = readHelpTopic('credit-memos').frontmatter
        const orderOf = (text: string) => Number(/^order:\s*(\d+)/m.exec(text)?.[1] ?? Number.NaN)
        expect(orderOf(frontmatter)).toBeGreaterThan(orderOf(credit))
    })

    it.each([
        'Bad debts',
        'sales tax',
        'Void',
        'cash basis',
        'credit memo',
        'paid a part',
    ])('names "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it.each([
        ['write off an invoice', /\bwrite off\b/i],
        ['void a write-off', /\bvoid\b/i],
        ['keys', KEYS_HEADING],
    ])('has a section for the task: %s', (_task, heading) => {
        expect(
            headings.some(h => heading.test(h)),
            `a heading matching ${heading}`
        ).toBe(true)
    })

    it.each(['⌘↵', 'Esc'])('lists the key %s in its key map', key => {
        expect(section(KEYS_HEADING)).toContain(key)
    })

    // A one-letter key stands alone: in a table cell, before a colon, or in backticks.
    it.each(['W', 'V', 'I', 'J'])('lists the key %s in its key map', key => {
        expect(section(KEYS_HEADING)).toMatch(new RegExp(`(^|[\\s|\`])${key}(?=[\\s|:\`]|$)`, 'm'))
    })

    it('writes keys with Mac glyphs only, no Ctrl', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/)
        expect(body).not.toMatch(/\b(Cmd|Alt|Shift)\b/)
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })

    it.each(['help://books:invoices', 'help://books:credit-memos'])('links %s', link => {
        expect(body).toContain(`(${link})`)
    })
})

// Apply credit spec §3.8 Help: a write-off takes the balance after credits.
describe('help/write-offs.md (apply credit)', () => {
    it('says the amount is the balance after credits', () => {
        expect(body).toContain('after credits')
    })
})
