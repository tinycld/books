import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const { exists, frontmatter, body } = readHelpTopic('documents')

describe('help/documents.md', () => {
    it('exists with a title and a summary', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('says how to preview a document', () => {
        expect(body).toContain('To see how your documents print,')
        expect(body).toContain('Preview PDF')
    })

    it('names the paper, the page numbers and the scripts that print', () => {
        expect(body).toContain('US Letter')
        expect(body).toContain('Page 1 of 2')
        expect(body).toMatch(/Greek, Cyrillic, Hebrew and Arabic/)
    })

    it('links the branding and settings topics', () => {
        expect(body).toContain('(help://core:organization-branding)')
        expect(body).toContain('(help://books:settings)')
    })

    it('hand-writes no hostname other than {{server-host}}', () => {
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co)\b/i)
    })
})
