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
