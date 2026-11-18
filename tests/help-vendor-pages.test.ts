import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const { exists, frontmatter, body } = readHelpTopic('vendor-pages')
const vendors = readHelpTopic('vendors')

// The first block of text that is not a heading.
function firstParagraph(text: string) {
    return (
        text
            .split(/\n\s*\n/)
            .map(block => block.trim())
            .find(block => block !== '' && !block.startsWith('#')) ?? ''
    )
}

describe('help/vendor-pages.md', () => {
    it('exists with a title and a summary in its frontmatter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts with what you owe a vendor', () => {
        expect(firstParagraph(body)).toMatch(/^To see what you owe a vendor/)
    })

    it('names the Open and Overdue figures', () => {
        expect(exists).toBe(true)
        for (const word of ['Open', 'Overdue']) {
            expect(body, word).toMatch(new RegExp(`\\b${word}\\b`))
        }
    })

    it('names New transaction and its five items', () => {
        expect(exists).toBe(true)
        for (const item of [
            'New transaction',
            'Bill',
            'Pay bills',
            'Expense',
            'Vendor credit',
            'Vendor refund',
        ]) {
            expect(body, item).toMatch(new RegExp(`\\b${item}\\b`))
        }
    })

    it('names the four tabs', () => {
        expect(exists).toBe(true)
        for (const tab of ['Transactions', 'Contacts', 'Details', 'Notes']) {
            expect(body, tab).toMatch(new RegExp(`\\b${tab}\\b`))
        }
    })

    it('explains editing in place with Save and Cancel', () => {
        expect(body).toMatch(/\bin place\b/i)
        expect(body).toMatch(/\bSave\b/)
        expect(body).toMatch(/\bCancel\b/)
    })

    it('explains contacts', () => {
        expect(body).toMatch(/\bcontacts?\b/i)
        expect(body).toMatch(/\bAdd contact\b/)
    })

    it('lists the page shortcuts as Mac glyphs', () => {
        expect(exists).toBe(true)
        for (const key of ['⌥N', '⌥1', '⌥4', '⌘S', 'Esc']) {
            expect(body, key).toContain(key)
        }
    })

    it('says Call needs an app for phone links on a desktop browser', () => {
        expect(body).toMatch(/\bCall\b/)
        expect(body).toMatch(/no (phone|calling) app|no app for phone/i)
    })

    it('holds no hostname and no Ctrl+ text', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\+/i)
        expect(body).not.toMatch(/https?:\/\//)
        expect(body).not.toMatch(/\b[a-z0-9-]+\.(com|org|net|io|dev|local)\b/i)
    })
})

describe('help/vendors.md and the vendor page', () => {
    it('links the Vendor pages topic', () => {
        expect(vendors.body).toContain('help://books:vendor-pages')
    })

    it('no longer says an open vendor is a form', () => {
        expect(vendors.body).not.toMatch(/\bgo back to the form\b/i)
        expect(vendors.body).not.toMatch(/the vendor opens in a panel beside the list/i)
        expect(vendors.body).not.toMatch(/Custom fields show before Notes on each vendor/)
    })
})
