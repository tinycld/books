import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADJUSTMENT_CHROME } from '../tinycld/books/lib/adjustment-kind'
import { STOCK_BY_BIN_TITLE } from '../tinycld/books/lib/inventory-adjust-fixture'
import { letterKey, lineWith, readHelpTopic } from './help-topic'

// The help of inventory-adjust (spec §3.12): the two new topics, books:inventory-adjustments
// and books:bin-locations, and the topics it updates. Each case fails when a topic does not
// name the new report, form or screen part.
const helpDir = path.resolve(__dirname, '../help')

// The titles tests/e2e/help-screenshots.spec.ts searches the help for.
const NEW_TOPICS = [
    ['inventory-adjustments', 'Inventory adjustments'],
    ['bin-locations', 'Bin locations'],
] as const

describe.each(NEW_TOPICS)('help/%s.md', (id, title) => {
    const { exists, source, frontmatter, body } = readHelpTopic(id)

    it('exists, with a title, a summary, tags and an order in its frontmatter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(new RegExp(`^title:\\s*${title}\\s*$`, 'm'))
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
        expect(frontmatter).toMatch(/^tags:\s*\S+/m)
        expect(frontmatter).toMatch(/^order:\s*\d+/m)
    })

    it('starts with the task', () => {
        expect(body.trimStart()).toMatch(/^To /)
    })

    it('links only to topics that exist', () => {
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        expect(ids.length).toBeGreaterThan(0)
        for (const linked of ids) {
            expect(existsSync(path.join(helpDir, `${linked}.md`)), `help://books:${linked}`).toBe(
                true
            )
        }
    })

    it('hand-writes no hostname and no Ctrl, Shift or Alt key text', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
        expect(body).not.toMatch(/\b(Ctrl|Control|Cmd|Command|Shift|Alt|Option)\s*\+/i)
    })
})

describe('help/inventory-adjustments.md', () => {
    const { body } = readHelpTopic('inventory-adjustments')

    it('is the help topic of the adjustment screen', () => {
        expect(ADJUSTMENT_CHROME.helpTopic).toBe('books:inventory-adjustments')
    })

    it('names the form', () => {
        expect(body).toContain('New inventory adjustment')
    })

    it('covers each task of the spec', () => {
        for (const subject of [
            /add stock at a cost|at a cost/i,
            /revalu/i,
            /\bcount\b/i,
            /\bPost\b/,
            /\bcorrect/i,
            /\bVoid\b/,
            /journal entry|Books posts/i,
        ]) {
            expect(body).toMatch(subject)
        }
    })

    // Spec §3.2 Keys: group "Inventory adjustment" and group "Lines", and the read view.
    it.each([
        ['Post & new', /⌘⇧↵|⇧⌘↵/],
        ['Post', /⌘↵/],
        ['Save draft', /⌘S/],
        ['Delete draft', /⌘⌫/],
        ['Add line', /⌥↵/],
    ])('lists the key of %s in Mac glyphs', (action, key) => {
        expect(lineWith(body, new RegExp(action.replace('&', '(&|and)')), key)).toBeDefined()
    })

    it.each([
        ['Edit', 'E'],
        ['Void', 'V'],
        ['Copy', 'C'],
    ])('lists the read view key of %s', (action, letter) => {
        expect(lineWith(body, new RegExp(`\\b${action}\\b`), letterKey(letter))).toBeDefined()
    })
})

describe('help/bin-locations.md', () => {
    const { body } = readHelpTopic('bin-locations')

    it('covers each task of the spec', () => {
        for (const subject of [
            /default bin/i,
            /\bsale\b/i,
            /\bbill\b/i,
            /\badjust/i,
            /\bmove\b/i,
            /No bin/,
        ]) {
            expect(body).toMatch(subject)
        }
    })

    it('names the Stock by Bin Location report and how to open it', () => {
        expect(body).toContain(STOCK_BY_BIN_TITLE)
        expect(body).toContain('Stock in this bin')
    })
})

describe('the topics inventory-adjust updates', () => {
    it('inventory names low stock and the reorder point, and links the two new topics', () => {
        const { body } = readHelpTopic('inventory')
        expect(body).toMatch(/\blow\b/i)
        expect(lineWith(body, /\blow\b/i, /reorder point/i)).toBeDefined()
        expect(body).toContain('(help://books:inventory-adjustments)')
        expect(body).toContain('(help://books:bin-locations)')
    })

    it('products-services names the Low stock chip and the stock line', () => {
        const { body } = readHelpTopic('products-services')
        expect(body).toContain('Low stock')
        expect(body).toMatch(/on hand/)
    })

    it('reports names the Stock by Bin Location and links the bin locations topic', () => {
        const { body } = readHelpTopic('reports')
        expect(
            lineWith(body, new RegExp(STOCK_BY_BIN_TITLE), /help:\/\/books:bin-locations/)
        ).toBeDefined()
    })
})
