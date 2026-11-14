import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const { exists, frontmatter, body } = readHelpTopic('customer-pages')
const customers = readHelpTopic('customers')

// The first block of text that is not a heading.
function firstParagraph(text: string) {
    return (
        text
            .split(/\n\s*\n/)
            .map(block => block.trim())
            .find(block => block !== '' && !block.startsWith('#')) ?? ''
    )
}

describe('help/customer-pages.md', () => {
    it('exists with a title and a summary in its frontmatter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts with what a customer owes', () => {
        expect(firstParagraph(body)).toMatch(/^To see what a customer owes/)
    })

    it('names the figures, New transaction, the tabs and the Primary contact', () => {
        for (const word of [
            'Open',
            'Overdue',
            'Credit',
            'New transaction',
            'Transactions',
            'Contacts',
            'Details',
            'Notes',
            'Primary',
        ]) {
            expect(body, word).toMatch(new RegExp(`\\b${word}\\b`))
        }
    })

    it('lists the page shortcuts', () => {
        for (const key of ['⌥N', '⌥1', '⌥4', '⌘S', 'Esc']) {
            expect(body, key).toContain(key)
        }
    })

    it('says Call opens nothing in a browser with no phone app', () => {
        expect(body).toMatch(/\bCall\b/)
        expect(body).toMatch(/no (phone|calling) app|no app for phone/i)
    })

    it('is linked from help/customers.md', () => {
        expect(customers.body).toContain('(help://books:customer-pages)')
    })
})
