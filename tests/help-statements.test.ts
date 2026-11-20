import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The statements help topic (statements spec §3.11): task-first prose that names the parts
// a user sees, the keys with Mac glyphs only, and no hand-written hostname.

const { exists, frontmatter, body } = readHelpTopic('statements')

// The first block of text that is not a heading.
function firstParagraph(text: string) {
    return (
        text
            .split(/\n\s*\n/)
            .map(block => block.trim())
            .find(block => block !== '' && !block.startsWith('#')) ?? ''
    )
}

describe('help/statements.md', () => {
    it('exists with a title and a summary in its frontmatter', () => {
        expect(exists).toBe(true)
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it('starts with the task of sending statements', () => {
        expect(firstParagraph(body)).toMatch(/^To send statements to your customers/)
    })

    it('names the types, the filter, the actions, the sent state, Numbering and Delete', () => {
        expect(exists).toBe(true)
        for (const word of [
            'Balance forward',
            'Open items',
            'Customer balance',
            'Preview',
            'Save and send',
            'Not sent',
            'Settings → Numbering',
            'Statements',
            'Delete',
        ]) {
            expect(body, word).toContain(word)
        }
    })

    it('lists the keys with Mac glyphs: ⌥P, ⌘S, ⌘↵, Esc, and S and D on a statement', () => {
        expect(exists).toBe(true)
        for (const key of ['⌥P', '⌘S', '⌘↵', 'Esc']) {
            expect(body, key).toContain(key)
        }
        // The single-letter keys of the statement screen, written as a key as other Books
        // topics write one: `M`, "press P", "(or press R)".
        expect(body).toMatch(/`S`|\*\*S\*\*|\bpress S\b|\(S\)/)
        expect(body).toMatch(/`D`|\*\*D\*\*|\bpress D\b|\(D\)/)
        expect(body).not.toMatch(/\bCtrl\b/i)
    })

    it('hand-writes no hostname', () => {
        expect(exists).toBe(true)
        const stripped = body.replaceAll('{{server-host}}', '')
        expect(stripped).not.toMatch(
            /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app|co|example)\b/i
        )
    })
})
