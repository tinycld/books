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

    it('explains opening stock: the three fields, the total value, and the date', () => {
        const section = sectionOf(body, 'Opening stock')
        expect(section).toContain('Opening quantity')
        expect(section).toContain('Opening value')
        expect(section).toContain('Opening stock as of')
        expect(section).toMatch(/total cost/)
        expect(section).toMatch(/required when you enter an opening quantity/)
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
        expect(section).toMatch(/next bill or expense/)
    })

    it('explains both costing methods, where to set one, and the lock', () => {
        const section = sectionOf(body, 'The costing method')
        expect(section).toContain(`**${COSTING_METHOD_LABELS.fifo}**`)
        expect(section).toContain(`**${COSTING_METHOD_LABELS.average}**`)
        expect(section).toMatch(/open Settings, choose Accounting/)
        expect(section).toContain(`"${COSTING_METHOD_LOCKED}"`)
        expect(section).toContain('(help://books:settings)')
    })

    it('says Books re-costs later sales by itself after a back-dated change', () => {
        expect(sectionOf(body, 'When an earlier date changes')).toMatch(
            /works those costs out again and posts the difference by itself/
        )
    })

    it('hand-writes no hostname and no Ctrl or Alt key text', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
        expect(body).not.toMatch(/\b(Ctrl|Control|Cmd|Command|Alt|Option)\s*\+/i)
    })
})
