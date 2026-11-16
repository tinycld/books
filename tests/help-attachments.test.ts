import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The attachments help topic `books:attachments` (attachments spec §3.9, checkpoint 4): how
// to attach a vendor's bill or a receipt, the limit, when a file is stored, and what Edit,
// Copy, Void and Delete draft do to attachments, with ⌥A in the Mac glyphs the help
// renderer translates.
const helpDir = path.resolve(__dirname, '../help')
const { exists, source, frontmatter, body } = readHelpTopic('attachments')

describe('help/attachments.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S/m)
        expect(frontmatter).toMatch(/^summary:\s*\S/m)
    })

    it.each([
        '20 MB',
        'Attach files',
        'Take photo',
        '⌥A',
        'Copy',
        'Void',
        'Delete draft',
        'Edit',
    ])('names %s', text => {
        expect(body).toContain(text)
    })

    it('links only to topics that exist', () => {
        expect(exists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it('has no Ctrl or Alt keyboard text', () => {
        expect(exists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bAlt\b/i)
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
