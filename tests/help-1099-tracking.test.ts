import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

function read(name: string) {
    return readFileSync(path.join(helpDir, name), 'utf8')
}

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('1099-tracking')

// Each `(?=[^.\n]*X)` asks for X in the same sentence, in any order.
describe('help/1099-tracking.md', () => {
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

    it('names the vendor form 1099 fields and the tax ID types', () => {
        for (const text of [
            'Track payments for 1099',
            'Legal name',
            'Tax ID type',
            'EIN (business)',
            'SSN or ITIN (person)',
        ]) {
            expect(body, text).toContain(text)
        }
    })

    it('says a tax ID has 9 digits and is stored with its dashes', () => {
        expect(body).toMatch(/(?=[^.\n]*\btax ID\b)[^.\n]*\b(9|nine) digits\b/i)
        expect(body).toMatch(/(?=[^.\n]*\b(stores?|stored|saves?|saved)\b)[^.\n]*\bdashes\b/i)
    })

    it('says a vendor can be tracked before its W-9 arrives', () => {
        expect(body).toMatch(/(?=[^.\n]*\btrack\w*)[^.\n]*\bbefore\b[^.\n]*\bW-9\b/i)
    })

    it('explains mapping accounts to boxes in Settings → 1099s', () => {
        expect(body).toContain('Settings → 1099s')
        expect(body).toContain('Not reported')
    })

    it('says only Cost of goods sold, Expense and Other expense accounts take a box', () => {
        // Case-sensitive, so the capital `Expense` is the type, not the end of `Other expense`.
        expect(body).toMatch(
            /(?=[^.\n]*\b[Oo]nly\b)(?=[^.\n]*\bCost of goods sold\b)(?=[^.\n]*\bOther expense\b)(?=[^.\n]*\bbox\b)[^.\n]*\bExpense\b/
        )
    })

    it('says only a Books admin changes the 1099 reporting threshold', () => {
        expect(body).toContain('1099 reporting threshold')
        expect(body).toMatch(/(?=[^.\n]*\bonly\b)(?=[^.\n]*\bthreshold\b)[^.\n]*\badmin\b/i)
    })

    it('names the Missing tax ID chip', () => {
        expect(body).toContain('Missing tax ID')
    })

    it('says the audit log does not show tax ID values', () => {
        expect(body).toMatch(
            /(?=[^.\n]*\baudit log\b)(?=[^.\n]*\btax ID\b)(?=[^.\n]*\bvalues?\b)[^.\n]*\b(not|never)\b/i
        )
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(topicExists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })

    it('is linked from vendors.md and settings.md', () => {
        expect(read('vendors.md')).toContain('help://books:1099-tracking')
        expect(read('settings.md')).toContain('help://books:1099-tracking')
    })
})
