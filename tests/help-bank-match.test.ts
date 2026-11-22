import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { paragraphWith, readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('bank-match')

const orderOf = (text: string) => Number(/^order:\s*(\d+)\s*$/m.exec(text)?.[1] ?? Number.NaN)

// The shot names help/screenshots.ts plans under the 'bank-match' key. The plan file
// imports Playwright, so the test reads its text instead of loading it.
function plannedShots(): string[] {
    const plan = readFileSync(path.join(helpDir, 'screenshots.ts'), 'utf8')
    const block = /'bank-match':\s*\[([\s\S]*?)\n {4}\],/.exec(plan)?.[1] ?? ''
    return [...block.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1])
}

describe('help/bank-match.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has its title, a summary and its tags in the frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*Match a bank transaction\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
        const tags = /^tags:\s*\[([^\]]*)\]\s*$/m.exec(frontmatter)?.[1] ?? ''
        const names = tags.split(',').map(tag => tag.trim().replace(/^["']|["']$/g, ''))
        expect(names).toEqual(expect.arrayContaining(['banking', 'match', 'review']))
    })

    it('sorts after the Review bank transactions topic', () => {
        expect(orderOf(frontmatter)).toBeGreaterThan(
            orderOf(readHelpTopic('bank-review').frontmatter)
        )
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it.each(['Match', 'Find other matches', 'Undo match'])('names the action "%s"', action => {
        expect(body).toContain(action)
    })

    it.each(['M', 'F', 'Z'])('names the key %s', key => {
        expect(body).toMatch(new RegExp(`\`${key}\`|\\b${key}\\b`))
    })

    it('has no Ctrl keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
    })

    it('names only images that help/screenshots.ts plans for the topic', () => {
        expect(topicExists).toBe(true)
        const shots = plannedShots()
        expect(shots).toEqual(['bank-match-1', 'bank-match-2'])
        const images = [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1])
        expect(images.length).toBeGreaterThan(0)
        for (const image of images) {
            expect(image.startsWith('images/'), image).toBe(true)
            expect(shots, image).toContain(path.basename(image, '.png'))
        }
    })
})

// Bank deposit spec §3.10 Help: the topic names the deposit as the Books transaction that
// one bank line matches, and links the Bank deposits topic there.
describe('help/bank-match.md (bank deposits)', () => {
    it('links help://books:bank-deposits where it names a deposit as a Books transaction', () => {
        expect(
            paragraphWith(
                body,
                /\bdeposits?\b/i,
                /Books transactions?/,
                /help:\/\/books:bank-deposits\b/
            )
        ).toBeDefined()
    })
})

describe.each(['bank-review', 'banking'])('help/%s.md', id => {
    it('links to the Match a bank transaction topic', () => {
        expect(readHelpTopic(id).source).toContain('help://books:bank-match')
    })
})
