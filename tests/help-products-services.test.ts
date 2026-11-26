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

    // Sales reports checkpoint 3: the list's Sales report button opens Sales by
    // Product/Service.
    it('links the sales reports section and names the Sales report button', () => {
        const links = [...body.matchAll(/\[([^\]]+)\]\(help:\/\/books:reports\)/g)].map(m => m[1])
        expect(
            links.some(text => /\bsales reports?\b|\bSales by Product\/Service\b/i.test(text))
        ).toBe(true)
        // The button's name, apart from the links' own text.
        expect(body.replace(/\[[^\]]*\]\([^)]*\)/g, '')).toMatch(/\bSales report\b/)
    })

    // The chooser's sentence says what each type is for; the topic gives it beside the label.
    it('names every type, each with what it is for', () => {
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

    it('says a bundle holds Services, Non-inventory items and Inventory items', () => {
        expect(body).toMatch(
            /(?=[^.\n]*\bbundle holds\b)(?=[^.\n]*\bServices\b)(?=[^.\n]*\bNon-inventory\b)[^.\n]*\bInventory items\b/
        )
        expect(body).not.toMatch(/Services and Non-inventory items only/)
    })

    it('says what an Inventory item adds and links the Inventory topic', () => {
        expect(body).toMatch(
            /(?=[^.\n]*\bInventory item\b)(?=[^.\n]*\balways purchased\b)[^.\n]*Cost of goods sold account/
        )
        expect(body).toMatch(
            /(?=[^.\n]*Inventory asset account)(?=[^.\n]*Preferred vendor)(?=[^.\n]*Reorder point)[^.\n]*Quantity on hand/
        )
        expect(body).toContain('(help://books:inventory)')
        expect(body).toMatch(/(?=[^.\n]*\bnew Inventory item\b)[^.\n]*\btaxable\b/)
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

    it('explains Taxable: a new Non-inventory item starts taxable, a Service does not, a bundle has none', () => {
        expect(body).toContain('Taxable')
        expect(body).toMatch(
            /(?=[^.\n]*\bNon-inventory\b)(?=[^.\n]*\b(new|starts?)\b)[^.\n]*\b[Tt]axable\b/
        )
        expect(body).toMatch(
            /(?=[^.\n]*\bServices?\b)(?=[^.\n]*\b(new|starts?)\b)(?=[^.\n]*\b(not|off|doesn't)\b)[^.\n]*\b[Tt]axable\b/
        )
        expect(body).toMatch(
            /(?=[^.\n]*\b[Bb]undles?\b)(?=[^.\n]*\b(no|not|without)\b)[^.\n]*\bTaxable\b/
        )
    })

    it('says an item on a bundle cannot be deleted until it is taken out or made inactive', () => {
        expect(body).toMatch(
            /(?=[^.\n]*\bbundles?\b)(?=[^.\n]*\bcannot be deleted\b)(?=[^.\n]*\b(take|taken)\b[^.\n]*\bout\b)[^.\n]*\binactive\b/i
        )
    })

    it('says a product on a bill cannot be deleted and can be made inactive instead', () => {
        expect(body).toMatch(/(?=[^.\n]*\bbills?\b)[^.\n]*\bcannot be deleted\b/i)
        expect(body).toMatch(/(?=[^.\n]*\bbills?\b)[^.\n]*\binactive\b/i)
    })

    // Expense form spec §3.11: a product on an expense line cannot be deleted.
    it('says a product on an expense cannot be deleted and can be made inactive instead', () => {
        // An expense document, not an expense account.
        expect(body).toMatch(
            /(?=[^.\n]*\bexpenses?\b(?!\s+accounts?\b))[^.\n]*\bcannot be deleted\b/i
        )
        expect(body).toMatch(/(?=[^.\n]*\bexpenses?\b(?!\s+accounts?\b))[^.\n]*\binactive\b/i)
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

    it('says search finds products by code, name, vendor part number or sales description', () => {
        expect(body.replace(/\s+/g, ' ')).toContain(
            'Search finds products by code, name, vendor part number or sales description.'
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
