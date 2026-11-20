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

    // Receive payment §3.9: the Transactions tab's fourth kind, its chip and its statuses.
    it('names the Payment kind, its Payments chip and its statuses', () => {
        expect(exists).toBe(true)
        for (const word of ['Payment', 'Payments', 'Applied', 'Partly paid']) {
            expect(body, word).toMatch(new RegExp(`\\b${word}\\b`))
        }
    })

    // Credit memo §3.10: the Transactions tab's fifth kind, its chip and its statuses.
    // Refund receipt §3.12: a credit memo with no credit left reads Refunded, not Applied.
    it('names the Credit memos chip and the statuses Unapplied and Refunded', () => {
        expect(exists).toBe(true)
        expect(body).toMatch(/\bCredit memos\b/)
        const sentences = body.split(/(?<=[.!?])\s+/)
        expect(
            sentences.some(s => /\bcredit memos?\b/i.test(s) && /\bUnapplied\b/.test(s)),
            'a sentence naming a credit memo and Unapplied'
        ).toBe(true)
        expect(
            sentences.some(s => /\bcredit memos?\b/i.test(s) && /\bRefunded\b/.test(s)),
            'a sentence naming a credit memo and Refunded'
        ).toBe(true)
    })

    // Refund receipt §3.13: the Transactions tab's sixth kind, its chip and its statuses.
    it('names the Refunds chip and the Refund receipt kind', () => {
        expect(exists).toBe(true)
        expect(body).toMatch(/\bRefunds\b/)
        expect(body).toMatch(/\bRefund receipts?\b/)
        const sentences = body.split(/(?<=[.!?])\s+/)
        expect(
            sentences.some(s => /\brefund receipts?\b/i.test(s) && /\bOpen\b/.test(s)),
            'a sentence saying how a refund changes Open'
        ).toBe(true)
    })

    it('is linked from help/customers.md', () => {
        expect(customers.body).toContain('(help://books:customer-pages)')
    })
})

// Write-off checkpoint 4 (write-off spec §3.6 Help): one paragraph on the Write-off rows.
describe('help/customer-pages.md (write-offs)', () => {
    it('names a write-off or the Written off status', () => {
        expect(body).toMatch(/\bwrite-offs?\b|\bWritten off\b/i)
    })
})
