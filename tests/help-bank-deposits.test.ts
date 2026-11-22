import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The help topic `books:bank-deposits` (bank deposit spec §3.10 Help): task-led sections on
// recording a deposit, the list of undeposited items, money out, other funds, drafts, edit
// and void, why a deposited payment cannot be edited, finding a deposit, and the key table
// of spec §3.2 in Mac glyphs.

const helpDir = path.resolve(__dirname, '../help')

const { exists, source, frontmatter, body } = readHelpTopic('bank-deposits')

// The body's paragraphs and list items, one block each.
const blocks = body
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)

function blockWith(...patterns: RegExp[]) {
    return blocks.find(block => patterns.every(pattern => pattern.test(block)))
}

// The spec's key map (§3.2): the form keys in Mac glyphs.
const FORM_KEYS = ['⌘↵', '⌘⇧↵', '⌘S', 'Esc', '⌘⌫', '⌥A', '⌥⌫', '⌥↵', '⌘⌥⌫'] as const

// The read view's single-letter keys, each on a line with the action it runs.
const LETTER_KEYS = [
    ['E', /\bEdit\b/],
    ['V', /\bVoid\b/],
    ['J', /journal entry/i],
] as const

// The table rows of the body (lines that start with a pipe).
const tableRows = body.split('\n').filter(line => line.trim().startsWith('|'))

describe('help/bank-deposits.md', () => {
    it('exists with the title "Bank deposits" and a summary in its front matter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*Bank deposits\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
        expect(frontmatter).toMatch(/^tags:\s*\[.+\]/m)
        expect(frontmatter).toMatch(/^order:\s*\d+\s*$/m)
    })

    it('sorts beside Receive payment', () => {
        const orderOf = (text: string) =>
            Number(/^order:\s*(\d+)\s*$/m.exec(text)?.[1] ?? Number.NaN)
        const receivePayment = orderOf(readHelpTopic('receive-payment').frontmatter)
        expect(Math.abs(orderOf(frontmatter) - receivePayment)).toBeLessThanOrEqual(1)
    })

    it('opens task-led: how to record a deposit', () => {
        expect(body).toMatch(/\bTo record a (bank )?deposit\b/i)
    })

    it('says what the list shows and why: what waits in Undeposited funds', () => {
        expect(blockWith(/Undeposited funds/, /\bpayments?\b/i, /sales receipts?/i)).toBeDefined()
    })

    it('explains money out as a negative item', () => {
        expect(blockWith(/money out/i, /negative|−\$|minus/i)).toBeDefined()
    })

    it('explains other funds, with a fee and cash kept back', () => {
        expect(blockWith(/Other funds/, /\bfees?\b/i)).toBeDefined()
        expect(blockWith(/Other funds|negative/i, /cash/i, /kept back|keep back/i)).toBeDefined()
    })

    it('explains drafts', () => {
        expect(blockWith(/\bdrafts?\b/i, /Save draft/)).toBeDefined()
    })

    it('explains edit and void: the number is kept and the items wait in Undeposited funds again', () => {
        expect(blockWith(/\bedit/i, /number/i)).toBeDefined()
        expect(blockWith(/\bvoid/i, /Undeposited funds again/i)).toBeDefined()
    })

    it('explains why a deposited payment cannot be edited or voided', () => {
        expect(blockWith(/remove it from the deposit first/i)).toBeDefined()
    })

    it('explains how to find a deposit: search and the Journal Entries list', () => {
        expect(blockWith(/\bsearch\b/i, /journal entries/i)).toBeDefined()
    })

    it.each(FORM_KEYS)('names the key %s in its key table', key => {
        expect(
            tableRows.some(row => row.includes(key)),
            key
        ).toBe(true)
    })

    it.each(LETTER_KEYS)('names the key %s with its action in the key table', (letter, action) => {
        const row = tableRows.find(
            line => new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`).test(line) && action.test(line)
        )
        expect(row, `a key table row with ${letter} and its action`).toBeDefined()
    })

    it('writes keys with Mac glyphs, never Ctrl or Alt text', () => {
        expect(exists).toBe(true)
        expect(body).toContain('⌘')
        expect(body).toContain('⇧')
        expect(body).toContain('⌥')
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
        expect(body).not.toMatch(/\bOption\b/)
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
        expect(stripped).not.toMatch(/\blocalhost\b/i)
    })

    it('links the receive payment topic', () => {
        expect(source).toContain('help://books:receive-payment')
    })

    it('links only to topics that exist', () => {
        expect(exists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        expect(ids.length).toBeGreaterThan(0)
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })
})
