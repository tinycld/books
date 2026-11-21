import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('bank-categorize')

// The body as one line, so a sentence that wraps in the markdown still matches.
const flat = body.replace(/\s+/g, ' ')

// The sentences of the body, so two words are checked to stand in one sentence.
const sentences = flat.split(/(?<=[.!?])\s+/)

function hasSentenceWith(...words: RegExp[]): boolean {
    return sentences.some(sentence => words.every(word => word.test(sentence)))
}

// The shot names help/screenshots.ts plans under the 'bank-categorize' key. The plan file
// imports Playwright, so the test reads its text instead of loading it.
function plannedShots(): string[] {
    const plan = readFileSync(path.join(helpDir, 'screenshots.ts'), 'utf8')
    const block = /'bank-categorize':\s*\[([\s\S]*?)\n {4}\],/.exec(plan)?.[1] ?? ''
    return [...block.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1])
}

describe('help/bank-categorize.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has its title, a summary and its tags in the frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*Categorize a bank transaction\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
        const tags = /^tags:\s*\[([^\]]*)\]\s*$/m.exec(frontmatter)?.[1] ?? ''
        const names = tags.split(',').map(tag => tag.trim().replace(/^["']|["']$/g, ''))
        expect(names).toEqual(
            expect.arrayContaining(['banking', 'categorize', 'split', 'transfer', 'review'])
        )
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it.each([
        'Categorize',
        'Match',
        'Transfer',
        'Split',
        'Record transfer',
        'Undo',
    ])('names "%s"', word => {
        expect(flat).toContain(word)
    })

    it('gives the example of a split with a negative line', () => {
        expect(flat).toMatch(/negative/i)
        expect(flat).toContain('-30.00')
    })

    it('says a credit card payment is recorded as a transfer', () => {
        expect(hasSentenceWith(/credit card/i, /transfer/i)).toBe(true)
    })

    it('says the other connected account matches the transfer', () => {
        expect(hasSentenceWith(/other account/i, /\bmatch/i)).toBe(true)
    })

    it('names the close date', () => {
        expect(flat).toMatch(/close date/i)
    })

    it.each(['⌘↵', '⌥↵', '⌘⌫', '⇧M'])('names the key %s with Mac glyphs', key => {
        expect(body).toContain(key)
    })

    it.each(['C', 'T', 'Z'])('names the key %s', key => {
        expect(body).toMatch(new RegExp(`\`${key}\``))
    })

    it('has no Ctrl or Cmd keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
        expect(body).not.toMatch(/\bCmd\b/i)
    })

    it('has no hand-written hostname', () => {
        expect(topicExists).toBe(true)
        const withoutTokens = body.replace(/\{\{server-host\}\}/g, '')
        expect(withoutTokens).not.toMatch(
            /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|app)\b/i
        )
    })

    it('names only images that help/screenshots.ts plans for the topic', () => {
        expect(topicExists).toBe(true)
        const shots = plannedShots()
        expect(shots).toHaveLength(3)
        const images = [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1])
        expect(images.length).toBeGreaterThan(0)
        for (const image of images) {
            expect(image.startsWith('images/'), image).toBe(true)
            expect(shots, image).toContain(path.basename(image, '.png'))
        }
    })
})

describe.each(['bank-review', 'bank-match', 'banking'])('help/%s.md', id => {
    it('links to the Categorize a bank transaction topic', () => {
        expect(readHelpTopic(id).source).toContain('help://books:bank-categorize')
    })
})
