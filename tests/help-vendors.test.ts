import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

function read(name: string) {
    return readFileSync(path.join(helpDir, name), 'utf8')
}

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('vendors')

const TERM_LABELS = ['Due on receipt', 'Net 10', 'Net 15', 'Net 30', 'Net 60'] as const

// Each `(?=[^.\n]*X)` asks for X in the same sentence, in any order.
describe('help/vendors.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has a title and a summary in its frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('explains creating a vendor', () => {
        expect(body).toMatch(/\bcreate\b/i)
        expect(body).toContain('New vendor')
        expect(body).toContain('Save and new')
    })

    it('explains editing a vendor', () => {
        expect(body).toMatch(/\bedit\b/i)
    })

    // The list-search sentence also names display name, company and email, so match the app-search sentence itself.
    it('explains finding a vendor from search', () => {
        expect(body.replace(/\s+/g, ' ')).toContain(
            'use the app search. Search finds vendors by display name, company, email or legal name.'
        )
    })

    it('says the app search matches the start of words', () => {
        expect(body).toContain('It matches words that start with what you type')
    })

    it('says how %, _ and \\ split a list search and which case it ignores', () => {
        expect(body).toContain(
            'In the list search, `%`, `_` and `\\` split the text into parts that must all appear'
        )
        expect(body).toContain('the list search ignores case for the letters A to Z only')
        expect(body).toContain('the app search ignores all case and accents')
    })

    it('links the 1099 tracking topic', () => {
        expect(body).toContain('help://books:1099-tracking')
    })

    it('explains payment terms and names every term', () => {
        expect(body).toContain('Payment terms')
        for (const label of TERM_LABELS) expect(body, label).toContain(label)
    })

    it('says the default expense account leaves out inactive, receivable and payable accounts', () => {
        expect(body).toContain('Default expense account')
        expect(body).toMatch(
            /(?=[^.\n]*\binactive accounts?\b)(?=[^.\n]*\baccounts receivable\b)(?=[^.\n]*\baccounts payable\b)[^.\n]*\b(not|never)\b/i
        )
    })

    it('explains inactive vendors', () => {
        expect(body).toContain('Make inactive')
        expect(body).toContain('Make active')
        expect(body).toContain('Show inactive')
    })

    it('explains that a delete cannot be undone', () => {
        expect(body).toMatch(/(?=[^.\n]*\bdelet\w*)[^.\n]*\bcannot be undone\b/i)
    })

    it('explains custom fields from Settings → Forms', () => {
        expect(body).toMatch(/custom fields?/i)
        expect(body).toMatch(/Settings\s*(→|>)\s*Forms/)
    })

    it('says the vendor opens beside the list on a very wide window and as a page otherwise', () => {
        expect(body).toMatch(
            /beside the list[^\n]*very wide window|very wide window[^\n]*beside the list/i
        )
        expect(body).toMatch(/\bown page\b/i)
    })

    it('says display names are unique among vendors, case ignored', () => {
        expect(body).toMatch(
            /(?=[^.\n]*\bdisplay names?\b)(?=[^.\n]*\bvendors\b)(?=[^.\n]*\b(unique|different)\b)[^.\n]*(\bcase\b[^.\n]*(ignored|does not matter|doesn't matter)|ignor\w*[^.\n]*\bcase\b)/i
        )
    })

    // A phone reopens Books at its last route, so "opens on Lists" is false after a first visit.
    it('gives the phone paths: opens where you left it, All lists, and the round + button', () => {
        expect(body).toMatch(/(?=[^.\n]*\bphone\b)[^.\n]*\bopens where you left it\b/i)
        expect(body).toMatch(/(?=[^.\n]*\bphone\b)(?=[^.\n]*\bAll lists\b)[^.\n]*\bback to Lists\b/)
        expect(body).not.toMatch(/opens on Lists/i)
        expect(body).toMatch(/(?=[^.\n]*\bphone\b)(?=[^.\n]*\bNew\b)[^.\n]*round \+ button/i)
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('is linked from navigating-books.md', () => {
        expect(read('navigating-books.md')).toContain('help://books:vendors')
    })
})
