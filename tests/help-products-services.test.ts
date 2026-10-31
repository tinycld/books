import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPES } from '../tinycld/books/lib/product-types'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

function read(name: string) {
    return readFileSync(path.join(helpDir, name), 'utf8')
}

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('products-services')

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Each `(?=[^.\n]*X)` asks for X in the same sentence, in any order.
describe('help/products-services.md', () => {
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

    // The chooser's sentence says what each type is for; the topic gives it beside the label.
    it('names the three types, each with what it is for', () => {
        expect(topicExists).toBe(true)
        const lines = body.split('\n')
        for (const { label, sentence } of PRODUCT_TYPES) {
            const purpose = new RegExp(escapeRegExp(sentence.replace(/\.$/, '')), 'i')
            const labelled = new RegExp(`\\b${escapeRegExp(label)}\\b`)
            const line = lines.find(text => labelled.test(text) && purpose.test(text))
            expect(line, `${label}: ${sentence}`).toBeDefined()
        }
    })

    it('explains creating a product, choosing a type, and Save and new', () => {
        expect(body).toMatch(/\bcreate\b/i)
        expect(body).toContain('New product or service')
        expect(body).toMatch(/\b(choose|pick)\b[^.\n]*\btype\b/i)
        expect(body).toContain('Save and new')
    })

    it('explains editing a product', () => {
        expect(body).toMatch(/\bedit\b/i)
    })

    it('says names are unique among products and services, case ignored', () => {
        expect(body).toMatch(
            /(?=[^.\n]*\bnames?\b)(?=[^.\n]*\bproducts and services\b)(?=[^.\n]*\b(unique|different)\b)[^.\n]*(\bcase\b[^.\n]*(ignored|does not matter|doesn't matter)|ignor\w*[^.\n]*\bcase\b)/i
        )
    })

    it('explains bundles: adding items with Qty, reordering, no bundle in a bundle, no price or accounts', () => {
        expect(body).toMatch(/(?=[^.\n]*\b[Aa]dd)[^.\n]*\bQty\b/)
        expect(body).toMatch(/\b(move\b[^.\n]*\b(up|down)\b|reorder)/i)
        expect(body).toMatch(/\bbundle cannot contain another bundle\b/i)
        expect(body).toMatch(
            /(?=[^.\n]*\bbundle\b)[^.\n]*\bno price\b[^.\n]*\baccounts?\b[^.\n]*\bof its own\b/i
        )
    })

    it('explains the purchasing fields under I purchase this from a vendor', () => {
        expect(body).toMatch(
            /(?=[^.\n]*I purchase this from a vendor)(?=[^.\n]*Purchase description)(?=[^.\n]*\bCost\b)[^.\n]*Expense account/
        )
    })

    it('explains Sales price and Income account', () => {
        expect(body).toContain('Sales price')
        expect(body).toContain('Income account')
    })

    it('says an item on a bundle cannot be deleted until it is taken out or made inactive', () => {
        expect(body).toMatch(
            /(?=[^.\n]*\bbundles?\b)(?=[^.\n]*\bcannot be deleted\b)(?=[^.\n]*\b(take|taken)\b[^.\n]*\bout\b)[^.\n]*\binactive\b/i
        )
    })

    it('explains inactive products', () => {
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

    it('says the product opens beside the list on a very wide window and as a page otherwise', () => {
        expect(body).toMatch(
            /beside the list[^\n]*very wide window|very wide window[^\n]*beside the list/i
        )
        expect(body).toMatch(/\bown page\b/i)
    })

    it('says search finds products by name, SKU or sales description', () => {
        expect(body.replace(/\s+/g, ' ')).toContain(
            'Search finds products by name, SKU or sales description.'
        )
    })

    it('says how %, _ and \\ split a list search and which case it ignores', () => {
        expect(body).toContain(
            'In the list search, `%`, `_` and `\\` split the text into parts that must all appear'
        )
        expect(body).toContain('the list search ignores case for the letters A to Z only')
        expect(body).toContain('the app search ignores all case and accents')
    })

    it('explains finding a product from the app search', () => {
        expect(body).toContain(
            'To find a product or service from anywhere in the app, use the app search.'
        )
        expect(body).toContain('It matches words that start with what you type')
    })

    it('gives the phone paths: All lists back to Lists, and the round + button', () => {
        expect(body).toMatch(/(?=[^.\n]*\bphone\b)(?=[^.\n]*\bAll lists\b)[^.\n]*\bback to Lists\b/)
        expect(body).toMatch(/(?=[^.\n]*\bphone\b)(?=[^.\n]*\bNew\b)[^.\n]*round \+ button/i)
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('is linked from navigating-books.md', () => {
        expect(read('navigating-books.md')).toContain('help://books:products-services')
    })
})
