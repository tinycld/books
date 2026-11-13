import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The first version of the sales receipt help topic (checkpoint 4): the header's
// HelpIcon opens `books:sales-receipts`, so the topic must exist from this checkpoint on.
const { exists, frontmatter, body } = readHelpTopic('sales-receipts')

describe('help/sales-receipts.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it('tells where the money goes: Deposit to', () => {
        expect(body).toContain('Deposit to')
    })
})

// Checkpoint 5: the completed topic (spec §3.10 Help).
describe('help/sales-receipts.md (complete)', () => {
    it.each([
        'Sales deposited to',
        'Undeposited funds',
        'Default message to customer',
    ])('names %s', text => {
        expect(body).toContain(text)
    })

    it.each(['⌘↵', '⌘⇧↵', '⌘S'])('names the key %s', key => {
        expect(body).toContain(key)
    })

    // The read view's single-letter keys, each on a line with the action it runs.
    it.each([
        ['E', /\bEdit\b/],
        ['V', /\bVoid\b/],
        ['C', /\bCopy\b/],
        ['J', /journal entry/i],
    ] as const)('names the read-view key %s with its action', (letter, action) => {
        const line = body
            .split('\n')
            .find(l => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(l) && action.test(l))
        expect(line, `a line with ${letter} and its action`).toBeDefined()
    })

    it('links the invoices topic', () => {
        expect(body).toContain('help://books:invoices')
    })
})
