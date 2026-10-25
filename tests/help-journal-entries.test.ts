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
})
