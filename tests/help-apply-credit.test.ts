import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The apply credit help topic (apply credit spec §3.8 Help, checkpoint 5): task-led, the keys
// in Mac glyphs, links to the credit memo and invoice topics.
const { exists, frontmatter, body } = readHelpTopic('apply-credit')

describe('help/apply-credit.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it.each([
        ['Apply to invoices', /\bApply to invoices\b/],
        ['Apply credit', /\bApply credit\b/],
        ['Remove', /\bRemove\b/],
        ['the apply date', /\bapply date\b/i],
        ['a part of an invoice', /\bpart of an invoice\b/i],
        ['the void rule', /\bvoid(ed)?\b/i],
        ['a payment amount that is not applied', /\bnot applied\b/i],
        ['cash basis', /\bcash basis\b/i],
    ])('names %s', (_name, pattern) => {
        expect(body).toMatch(pattern)
    })

    it.each(['⌘↵', '⌥↵', 'Esc'])('lists the key %s', key => {
        expect(body).toContain(key)
    })

    // A one-letter key is marked as a key (a table cell, backticks or bold), so the article
    // "A" at the start of a sentence does not count.
    it('lists the key A', () => {
        expect(body).toMatch(/`A`|\|\s*A\s*\||\*\*A\*\*/)
    })

    it('writes keys with Mac glyphs only, no Ctrl', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/)
        expect(body).not.toMatch(/\b(Cmd|Alt|Shift)\b/)
    })

    it.each(['help://books:credit-memos', 'help://books:invoices'])('links %s', link => {
        expect(body).toContain(`(${link})`)
    })
})
