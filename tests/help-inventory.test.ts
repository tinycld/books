import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COSTING_METHOD_LABELS, COSTING_METHOD_LOCKED } from '../tinycld/books/lib/costing-method'
import { COGS_ACCOUNT_LABEL } from '../tinycld/books/lib/product-form'
import { stockWarning } from '../tinycld/books/lib/stock-warning'
import { readHelpTopic, sectionOf } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('inventory')

describe('help/inventory.md', () => {
    it('exists, with a title and a summary in its frontmatter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts with the task', () => {
        expect(body.trimStart()).toMatch(/^To track the goods you buy and sell,/)
    })

    it('links only to topics that exist', () => {
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        expect(ids.length).toBeGreaterThan(0)
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('is linked from the products, settings, setup, navigating, bills and expenses topics', () => {
        for (const topic of [
            'products-services',
            'settings',
            'setup-wizard',
            'navigating-books',
            'bills',
            'expenses',
        ]) {
            const text = readFileSync(path.join(helpDir, `${topic}.md`), 'utf8')
            expect(text, topic).toContain('(help://books:inventory)')
        }
    })

    it('names the fields of an Inventory item as the form does', () => {
        const section = sectionOf(body, 'Create an Inventory item')
        for (const label of [
            'Inventory asset account',
            COGS_ACCOUNT_LABEL,
            'Preferred vendor',
            'Reorder point',
        ]) {
            expect(section, label).toContain(`**${label}**`)
        }
        expect(section).toMatch(/always purchased/)
        expect(section).toMatch(/cannot become another type/)
    })

    it('says what the cost of goods sold account starts as and what Books fills in when it is empty', () => {
        const section = sectionOf(body, 'Create an Inventory item')
        expect(section).toMatch(/new item starts with the first active Cost of goods sold account/)
        expect(section).toMatch(/If you choose none, Books uses the first Supplies and materials/)
        expect(section).toMatch(/creates a Cost of goods sold account when the chart has none/)
        expect(section).not.toMatch(/starts with the first of them/)
    })

    it('explains opening stock: the three fields, the total value, and the date', () => {
        const section = sectionOf(body, 'Opening stock')
        expect(section).toContain('Opening quantity')
        expect(section).toContain('Opening value')
        expect(section).toContain('Opening stock as of')
        expect(section).toMatch(/total cost/)
        expect(section).toMatch(/required when you enter an opening quantity/)
        expect(section).toMatch(
            /Saving an item with an opening quantity is an inventory transaction: it locks the costing method/
        )
    })

    it('says which transactions change the quantity on hand', () => {
        const section = sectionOf(body, 'Quantity on hand')
        for (const topic of [
            'bills',
            'expenses',
            'invoices',
            'sales-receipts',
            'credit-memos',
            'refund-receipts',
            'vendor-credits',
        ]) {
            expect(section, topic).toContain(`(help://books:${topic})`)
        }
        expect(section).toMatch(/cost of goods sold account/)
        expect(section).toMatch(/A draft changes nothing/)
        expect(section).toMatch(/cannot type it/)
    })

    it('says a bundle takes each Inventory item from its own quantity on hand', () => {
        expect(sectionOf(body, 'Bundles with Inventory items')).toMatch(
            /each Inventory item from its own quantity on hand/
        )
    })

    it("quotes the form's negative-stock note and says Post stays allowed", () => {
        const section = sectionOf(body, 'Selling more than you have')
        const note = stockWarning({ type: 'inventory', quantity_on_hand: 3 }, 4)
        expect(note).not.toBeNull()
        expect(section).toContain(`"${note}"`)
        expect(section).toMatch(/does not stop you/)
        expect(section).toMatch(/last cost it knows/)
        expect(section).toMatch(
            /next receipt of the item \(a bill, an expense or a return from a customer\), or when you change its opening stock/
        )
        expect(section).not.toMatch(/next bill or expense/)
        // No screen makes an inventory adjustment; opening stock is the one a person makes.
        expect(section).not.toMatch(/inventory adjustment that adds stock/)
    })

    it('explains both costing methods, where to set one, and the lock', () => {
        const section = sectionOf(body, 'The costing method')
        expect(section).toContain(`**${COSTING_METHOD_LABELS.fifo}**`)
        expect(section).toContain(`**${COSTING_METHOD_LABELS.average}**`)
        expect(section).toMatch(/open Settings, choose Accounting/)
        expect(section).toContain(`"${COSTING_METHOD_LOCKED}"`)
        expect(section).toContain('(help://books:settings)')
        expect(section).toMatch(/Saving an item with opening stock also locks it/)
    })

    it('says the opening entry changes only with the item', () => {
        const section = sectionOf(body, 'Opening stock')
        expect(section).toMatch(/has no Edit and no Void/)
        expect(section).toMatch(/change the opening fields of the item/)
    })

    it('says Books re-costs later sales by itself after a back-dated change', () => {
        expect(sectionOf(body, 'When an earlier date changes')).toMatch(
            /works those costs out again and posts the difference by itself/
        )
    })

    it('says where a re-cost of a sale in a closed period posts, and what a refusal names', () => {
        const section = sectionOf(body, 'When an earlier date changes')
        expect(section).toMatch(/on or before the close date/)
        expect(section).toMatch(/on the date of the transaction that changed the cost/)
        expect(section).toMatch(/A change of the item's cost posts it on today's date/)
        expect(section).toMatch(/names the transaction and the item/)
    })

    it('hand-writes no hostname and no Ctrl or Alt key text', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
        expect(body).not.toMatch(/\b(Ctrl|Control|Cmd|Command|Alt|Option)\s*\+/i)
    })
})
