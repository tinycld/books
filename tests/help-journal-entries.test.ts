import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const helpDir = path.resolve(__dirname, '../help')
const topicPath = path.join(helpDir, 'journal-entries.md')

function read(name: string) {
    return readFileSync(path.join(helpDir, name), 'utf8')
}

const topicExists = existsSync(topicPath)
const source = topicExists ? read('journal-entries.md') : ''
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

describe('help/journal-entries.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
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
        'create',
        'post',
        'draft',
        'Post & new',
        'edit',
        'reverse',
        'void',
        'auto-reverse',
    ])('mentions "%s"', phrase => {
        expect(body.toLowerCase()).toContain(phrase.toLowerCase())
    })

    it('says a void reversal entry can only be opened', () => {
        expect(body).toMatch(/void reversal[^\n]*\bopen/i)
    })

    it('states the close date rule for auto-reverse', () => {
        const section = /## Set an auto-reverse date([\s\S]*?)(\n## |$)/.exec(body)?.[1] ?? ''
        expect(section).toMatch(/close date/i)
    })

    it('mentions the admin override for the closed-period rule', () => {
        const section = /## Post an entry([\s\S]*?)(\n## |$)/.exec(body)?.[1] ?? ''
        expect(section).toMatch(/closed period/i)
        expect(section).toMatch(/override/i)
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

    it.each(['account-register.md', 'navigating-books.md'])('is linked from %s', name => {
        expect(read(name)).toContain('help://books:journal-entries')
    })

    describe('keyboard', () => {
        const keys = keyboardSection(body)

        it('has a keyboard section', () => {
            expect(keys).not.toBe('')
        })

        it.each(['⌘↵', '⌘⇧↵', '⌘S', 'Esc', '⌘⌫'])('names the form key %s', key => {
            expect(keys).toContain(key)
        })

        it('names E for Edit, V for Void and R for Reverse', () => {
            expect(keys).toMatch(/\bE\b[^\n]*\bEdit\b|\bEdit\b[^\n]*\bE\b/)
            expect(keys).toMatch(/\bV\b[^\n]*\bVoid\b|\bVoid\b[^\n]*\bV\b/)
            expect(keys).toMatch(/\bR\b[^\n]*\bReverse\b|\bReverse\b[^\n]*\bR\b/)
        })

        it('says the Date field has focus on a wide screen in a web browser', () => {
            const lines = body
                .split('\n')
                .filter(line => /date[^\n]*focus|focus[^\n]*date/i.test(line))
            expect(lines).not.toEqual([])
            for (const line of lines) {
                expect(line).toMatch(/wide screen/i)
                expect(line).toMatch(/web browser/i)
            }
        })

        it('says the form keys also work in a text box and E, V and R do not', () => {
            expect(keys).toMatch(/text box/i)
            expect(keys).not.toMatch(/click outside/i)
        })

        it('names the shortcut list key without the ⇧ glyph', () => {
            expect(keys).toMatch(/press \?/i)
            expect(body).not.toContain('⇧?')
        })
    })

    describe('the Name field under "Create an entry"', () => {
        const create = /## Create an entry([\s\S]*?)(\n## |$)/.exec(body)?.[1] ?? ''

        it('names the Name field for a customer or a vendor', () => {
            expect(create).toMatch(/\bName\b/)
            expect(create).toMatch(/customer[^\n]*vendor|vendor[^\n]*customer/i)
        })

        it('says only active customers and vendors are listed', () => {
            expect(create).toMatch(/only active customers and vendors/i)
        })

        it('says a customer or vendor on lines is made inactive, not deleted', () => {
            expect(create).toMatch(/cannot be deleted/i)
            expect(create).toMatch(/make it inactive/i)
        })
    })

    it('says under "Reverse an entry" that a transfer cannot be reversed', () => {
        const reverse = /## Reverse an entry([\s\S]*?)(\n## |$)/.exec(body)?.[1] ?? ''
        expect(reverse).not.toBe('')
        expect(reverse).toMatch(/transfer[^\n]*cannot be reversed/i)
    })
})

// The body of the first `## …` section whose heading names the keyboard.
function keyboardSection(text: string): string {
    return /\n## [^\n]*keyboard[^\n]*([\s\S]*?)(\n## |$)/i.exec(`\n${text}`)?.[1] ?? ''
}
