import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TAX_AGENCIES, TAX_RATE_ROWS } from '../tinycld/books/lib/tax-rates-fixture'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('sales-tax')

// The list items of the "When Books says no" section, one per line.
function refusalItems() {
    const section = body.split(/^## When Books says no$/m)[1] ?? ''
    const [beforeNextHeading] = section.split(/^## /m)
    return beforeNextHeading
        .split('\n')
        .filter(line => line.startsWith('- '))
        .join('\n')
}

describe('help/sales-tax.md', () => {
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

    it('starts a sentence with "To collect sales tax"', () => {
        expect(body).toMatch(/(^|\n|[.!?]\s+)To collect sales tax\b/)
    })

    it('explains adding an agency and its liability account', () => {
        expect(body).toContain('Add agency')
        expect(body).toMatch(/liability account/i)
    })

    it('explains adding a rate with up to four decimals', () => {
        expect(body).toContain('Add rate')
        expect(body).toMatch(/\bfour decimals?\b/i)
    })

    it('explains combining two to ten rates in a group', () => {
        expect(body).toContain('Add group')
        expect(body).toMatch(/\btwo to ten\b|\b2 to 10\b/i)
    })

    it('explains setting the default for new sales', () => {
        expect(body).toContain('Default for new sales')
    })

    it('explains marking products taxable', () => {
        expect(body).toContain('Taxable')
    })

    it('explains marking a customer exempt with a reason', () => {
        expect(body).toContain('This customer is tax exempt')
        expect(body).toContain('Exemption reason')
    })

    it('names the refusals and what each one means', () => {
        for (const refusal of [
            'This rate is in the group',
            'This is the default for new sales',
            'This agency has',
            'Make its',
        ]) {
            expect(body, refusal).toContain(refusal)
        }
    })

    // Each refusal a user can reach (server/sales_tax.go, server/customers.go) is quoted
    // in the refusals list, where a user who sees it looks it up; a count or a name in the
    // message may be written as a number, N or "…".
    it('quotes in "When Books says no" every refusal a user can reach', () => {
        const refusals = refusalItems()
        for (const message of [
            /"This rate is in the group “[^”]*”\. Remove it from the group first\."/,
            /"This rate is in \S+ groups\. Remove it from them first\."/,
            /"Remove it from the group “[^”]*” or make the group inactive first\."/,
            /"Remove it from its \S+ active groups or make them inactive first\."/,
            /"This is the default for new sales\. Choose another default first\."/,
            /"This agency has \S+ tax rates\. Delete them or move them to another agency first\."/,
            /"Make its \S+ active rates inactive first\."/,
            /"Only an active rate or group can be the default\."/,
            /"“[^”]*” is inactive\."/,
            /"Each rate can be in a group once\."/,
            /"The default sales tax does not exist\."/,
            /"The default sales tax is inactive\."/,
        ]) {
            expect.soft(refusals, String(message)).toMatch(message)
        }
    })

    it('names no seeded agency, rate or group', () => {
        for (const { name } of [...TAX_AGENCIES, ...TAX_RATE_ROWS]) {
            expect(body, name).not.toContain(name)
        }
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(topicExists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
