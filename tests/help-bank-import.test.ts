import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('bank-import')

const ONE_FORMAT =
    "Import each account's statements in one format. A CSV row and an OFX row are the same transaction only when the date, the amount and the description are all the same, so importing the same month once as CSV and once as OFX can add a transaction twice."

describe('help/bank-import.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has a title and a summary in its frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*Import bank transactions\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it.each([
        'map columns',
        'first row',
        'date format',
        'money in',
        'money out',
        'already imported',
        'skipped',
        'import more',
        'bank statement',
        'read-only',
    ])('mentions "%s"', phrase => {
        expect(body.toLowerCase()).toContain(phrase)
    })

    it('mentions "review transactions"', () => {
        expect(body.toLowerCase()).toContain('review transactions')
    })

    it('links to the Review bank transactions topic', () => {
        expect(source).toContain('help://books:bank-review')
    })

    it('says to import each account’s statements in one format, word for word', () => {
        expect(body.replace(/\s+/g, ' ')).toContain(ONE_FORMAT)
    })

    it('has no hand-written hostname', () => {
        expect(topicExists).toBe(true)
        const withoutTokens = body.replace(/\{\{server-host\}\}/g, '')
        expect(withoutTokens).not.toMatch(
            /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app)\b/i
        )
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    describe('keyboard', () => {
        const keys = keyboardSection(body)

        it('has a keyboard section', () => {
            expect(keys).not.toBe('')
        })

        it.each(['⌘↵', 'Esc'])('names the key %s', key => {
            expect(keys).toContain(key)
        })

        it('names A for choosing all or none', () => {
            expect(keys).toMatch(/\bA\b/)
        })
    })
})

// The body of the first `## …` section whose heading names the keyboard.
function keyboardSection(text: string): string {
    return /\n## [^\n]*keyboard[^\n]*([\s\S]*?)(\n## |$)/i.exec(`\n${text}`)?.[1] ?? ''
}
