import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists, source, frontmatter, body } = readHelpTopic('pay-bills')

// The Pay Bills keys of the spec's table (§3.1) in the Mac glyphs the help renderer
// translates.
const FORM_KEYS = ['⌘↵', '⌘⇧↵', 'Esc', '⌥A', '⌥⌫', '⌥↵'] as const

// The read views' single-letter keys, each on a line with the action it runs.
const LETTER_KEYS = [
    ['E', /\bEdit\b/],
    ['V', /\bVoid\b/],
    ['J', /journal entry/i],
    ['P', /Pay bill\b/],
] as const

// The topics it links (spec §3.12: bills ↔ pay-bills, expenses, reports).
const LINKED = ['bills', 'expenses', 'reports'] as const

describe('help/pay-bills.md', () => {
    it('exists with a title and a summary in its frontmatter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it.each(FORM_KEYS)('names the key %s', key => {
        expect(exists).toBe(true)
        expect(body).toContain(key)
    })

    it.each(LETTER_KEYS)('names the key %s with its action', (letter, action) => {
        expect(exists).toBe(true)
        const line = body
            .split('\n')
            .find(l => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(l) && action.test(l))
        expect(line, `a line with ${letter} and its action`).toBeDefined()
    })

    it('writes keys with Mac glyphs, never Ctrl, Shift or Alt text', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bShift\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it.each(LINKED)('links the %s topic, which exists', id => {
        expect(source).toContain(`help://books:${id}`)
        expect(existsSync(path.join(helpDir, `${id}.md`)), `help/${id}.md`).toBe(true)
    })

    // Vendor credit spec §3.10, §3.13: the notice of unapplied vendor credits above the open
    // bills, and Open balance after the credits applied.
    describe('vendor credits', () => {
        const lines = body.split('\n')
        const lineWith = (...parts: RegExp[]) =>
            lines.find(line => parts.every(part => part.test(line)))

        it('names the notice of unapplied vendor credits above the open bills', () => {
            expect(
                lineWith(/\bvendor credits?\b/i, /\bunapplied\b/i, /\bopen bills\b/i),
                'a line on the unapplied vendor credits notice'
            ).toBeDefined()
        })

        it('says Open balance is after the credits applied', () => {
            expect(
                lineWith(/\bOpen balance\b/, /\bcredits?\b/i),
                'a line saying Open balance is what is left after payments and credits'
            ).toBeDefined()
        })

        it('links the vendor credits topic, which exists', () => {
            expect(source).toContain('help://books:vendor-credits')
            expect(existsSync(path.join(helpDir, 'vendor-credits.md'))).toBe(true)
        })
    })

    it('links only to topics that exist', () => {
        expect(exists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })
})
