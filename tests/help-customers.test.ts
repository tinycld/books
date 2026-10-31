import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

function read(name: string) {
    return readFileSync(path.join(helpDir, name), 'utf8')
}

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('customers')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)

describe('help/customers.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
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

    it('explains creating a customer', () => {
        expect(body).toMatch(/\bcreate\b/i)
        expect(body).toContain('New customer')
        expect(body).toContain('Save and new')
    })

    it('explains editing a customer', () => {
        expect(body).toMatch(/\bedit\b/i)
    })

    it('explains finding a customer from search', () => {
        expect(body).toMatch(/search[^\n]*display name[^\n]*company[^\n]*email/i)
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

    it('says the list loads more customers as you scroll', () => {
        expect(body).toContain('The list loads more customers as you scroll down.')
    })

    it('explains sub-customers and the Parent customer field', () => {
        expect(body).toContain('Add sub-customer')
        expect(body).toContain('Parent customer')
        expect(body).toMatch(/one level/i)
    })

    it('explains inactive customers', () => {
        expect(body).toContain('Make inactive')
        expect(body).toContain('Make active')
        expect(body).toContain('Show inactive')
        // Why a parent cannot be made inactive.
        expect(body).toMatch(/active sub-customers/i)
    })

    it('explains delete and why a customer with sub-customers cannot be deleted', () => {
        expect(body).toMatch(/\bdelete\b/i)
        expect(body).toMatch(
            /sub-customers[^\n]*(cannot|can't) be deleted|(cannot|can't) delete[^\n]*sub-customers/i
        )
    })

    it('explains custom fields from Settings → Forms', () => {
        expect(body).toMatch(/custom fields?/i)
        expect(body).toMatch(/Settings\s*(→|>)\s*Forms/)
    })

    it('says the customer opens beside the list on a very wide window and as a page otherwise', () => {
        expect(body).toMatch(
            /beside the list[^\n]*very wide window|very wide window[^\n]*beside the list/i
        )
        expect(body).toMatch(/\bown page\b/i)
    })

    // Each `(?=[^.\n]*X)` asks for X in the same sentence, in any order.
    it('says display names are unique among customers with the same parent, case ignored', () => {
        expect(body).toMatch(/(?=[^.\n]*same parent)[^.\n]*\b(unique|different)\b/i)
        expect(body).toMatch(/(?=[^\n]*same parent)[^\n]*top[- ]level/i)
        expect(body).toMatch(
            /(?=[^\n]*same parent)[^\n]*(\bcase\b[^.\n]*(ignored|does not matter|doesn't matter)|ignor\w*[^.\n]*\bcase\b)/i
        )
    })

    it('ties custom fields to the form a customer uses, the default form for new customers', () => {
        expect(body).toMatch(/(?=[^.\n]*custom fields?)(?=[^.\n]*\buses\b)[^.\n]*\bform\b/i)
        expect(body).toMatch(/(?=[^.\n]*new customers?)[^.\n]*default form/i)
        expect(body).not.toMatch(/on every customer/i)
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
        expect(read('navigating-books.md')).toContain('help://books:customers')
    })
})
