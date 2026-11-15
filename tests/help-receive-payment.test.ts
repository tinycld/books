import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists, source, frontmatter, body } = readHelpTopic('receive-payment')

// The spec's key map (§3.1) in the Mac glyphs the help renderer translates.
const FORM_KEYS = ['⌘↵', '⌘⇧↵', '⌘S', 'Esc', '⌘⌫', '⌥⌫', '⌥A', '⌥↵'] as const

// The read views' single-letter keys, each on a line with the action it runs.
const LETTER_KEYS = [
    ['E', /\bEdit\b/],
    ['V', /\bVoid\b/],
    ['J', /journal entry/i],
    ['R', /Receive payment/],
] as const

describe('help/receive-payment.md', () => {
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

    it('writes keys with Mac glyphs, never Ctrl or Alt text', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('links the invoices topic', () => {
        expect(source).toContain('help://books:invoices')
    })

    it('links only to topics that exist', () => {
        expect(exists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })
})
