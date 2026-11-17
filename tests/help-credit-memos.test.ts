import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The first version of the credit memo help topic (checkpoint 3): the header's HelpIcon
// opens `books:credit-memos`, so the topic must exist from this checkpoint on.
// Checkpoint 5 adds to this file.
const { exists, frontmatter, body } = readHelpTopic('credit-memos')

describe('help/credit-memos.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it('names the figure the form shows: Credit amount', () => {
        expect(body).toContain('Credit amount')
    })

    it.each(['⌘↵', '⌘⇧↵', '⌘S', 'Esc'])('names the key %s', key => {
        expect(body).toContain(key)
    })
})
