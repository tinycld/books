import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve(__dirname, '../help/chart-of-accounts.md'), 'utf8')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

describe('help/chart-of-accounts.md', () => {
    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('names the Import button as Import N accounts', () => {
        expect(body).toContain('Import N accounts')
    })

    it('explains Row N in the error report', () => {
        expect(body).toContain('Row N')
    })

    it('says the file must be comma-separated', () => {
        expect(body).toContain('comma-separated')
    })

    it('says the preview marks the row inserted second with an Error, and error rows are not imported', () => {
        expect(body).toMatch(/same number/i)
        expect(body).toMatch(/parents/i)
        expect(body).toMatch(/inserted second|later-inserted/i)
        expect(body).toMatch(/not imported/i)
        expect(body).not.toMatch(/refused by the server/i)
    })

    it('says every row needs a Type and a Detail type that belong together, and that the example is valid', () => {
        const section = body.slice(body.indexOf('## Import accounts'))
        expect(section).toMatch(/detail type/i)
        expect(section).toMatch(/belong together|valid pair/i)
        expect(section).toMatch(/example/i)
    })

    it('says group chips, not the group chip', () => {
        expect(body).toContain('group chips')
        expect(body).not.toMatch(/the group chip\b/)
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })

    it('writes shortcuts with Mac glyphs only', () => {
        expect(body).not.toMatch(/\b(Ctrl|Control|Cmd|Command|Alt|Option)\s*\+/i)
        expect(body).not.toMatch(/\bShift\s*\+/i)
    })
})
