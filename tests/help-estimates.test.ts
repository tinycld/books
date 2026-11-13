import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The first version of the estimate help topic (checkpoint 2): the header's HelpIcon opens
// `books:estimates`, so the topic must exist from this checkpoint on. Checkpoint 4
// completes it.
const { exists, frontmatter, body } = readHelpTopic('estimates')

describe('help/estimates.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it.each(['Save & close', 'Pending', 'Accepted', 'Rejected'])('names %s', text => {
        expect(body).toContain(text)
    })
})
