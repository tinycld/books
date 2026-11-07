import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

function read(name: string) {
    return readFileSync(path.join(helpDir, name), 'utf8')
}

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('banking')

describe('help/banking.md', () => {
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

    it.each([
        'connect account',
        'choose file',
        'csv',
        'ofx',
        'qfx',
        'qbo',
        '5 mb',
        'already uploaded',
        'remove',
        'disconnect',
        'drag',
    ])('mentions "%s"', phrase => {
        expect(body.toLowerCase()).toContain(phrase)
    })

    it('says dragging a file works in a web browser', () => {
        const lines = linesMatching(body, /drag/i)
        expect(lines).not.toEqual([])
        for (const line of lines) expect(line).toMatch(/web browser/i)
    })

    it('says TXT is not accepted and tells to rename the file to .csv', () => {
        expect(body).toMatch(/txt/i)
        const lines = linesMatching(body, /txt/i)
        expect(lines.some(line => /rename/i.test(line) && /\.csv/i.test(line))).toBe(true)
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

    it.each([
        'account-register.md',
        'chart-of-accounts.md',
        'navigating-books.md',
    ])('is linked from %s', name => {
        expect(read(name)).toContain('help://books:banking')
    })

    it('links to the Import bank transactions topic', () => {
        expect(source).toContain('help://books:bank-import')
    })

    it('no longer says Books keeps a file until you import it', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toContain('Books keeps it until you import its transactions')
    })

    it('references its screenshot', () => {
        expect(body).toContain('images/banking-1.png')
    })

    describe('keyboard', () => {
        const keys = keyboardSection(body)

        it('has a keyboard section', () => {
            expect(keys).not.toBe('')
        })

        it.each(['⌘↵', 'Esc'])('names the dialog key %s', key => {
            expect(keys).toContain(key)
        })

        it('names N for Connect account and U for Choose file', () => {
            expect(keys).toMatch(/\bN\b[^\n]*Connect account|Connect account[^\n]*\bN\b/)
            expect(keys).toMatch(/\bU\b[^\n]*Choose file|Choose file[^\n]*\bU\b/)
        })

        it('names I for importing transactions', () => {
            expect(keys).toMatch(/\bI\b[^\n]*Import|Import[^\n]*\bI\b/)
        })

        it('says N and U do not work while a dialog is open', () => {
            const lines = linesMatching(keys, /\bN\b[^\n]*\bU\b/)
            expect(lines.some(line => /dialog/i.test(line))).toBe(true)
        })

        it('names the shortcut list key without the ⇧ glyph', () => {
            expect(keys).toMatch(/press \?/i)
            expect(body).not.toContain('⇧?')
        })
    })

    it('says Account has focus when Connect opens in a web browser', () => {
        const lines = linesMatching(body, /account[^\n]*focus|focus[^\n]*account/i)
        expect(lines).not.toEqual([])
        expect(lines.some(line => /web browser/i.test(line))).toBe(true)
    })
})

function linesMatching(text: string, pattern: RegExp): string[] {
    return text.split('\n').filter(line => pattern.test(line))
}

// The body of the first `## …` section whose heading names the keyboard.
function keyboardSection(text: string): string {
    return /\n## [^\n]*keyboard[^\n]*([\s\S]*?)(\n## |$)/i.exec(`\n${text}`)?.[1] ?? ''
}
