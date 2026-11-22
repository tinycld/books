import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

// The help topic of the reconcile feature (reconcile spec §4 "Help", §3 "Keys"; plan
// checkpoint 6).

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('reconcile')

const orderOf = (text: string) => Number(/^order:\s*(\d+)\s*$/m.exec(text)?.[1] ?? Number.NaN)

// The shot names help/screenshots.ts plans under the 'reconcile' key. The plan file
// imports Playwright, so the test reads its text instead of loading it.
function plannedShots(): string[] {
    const plan = readFileSync(path.join(helpDir, 'screenshots.ts'), 'utf8')
    const block = /\breconcile:\s*\[([\s\S]*?)\n {4}\],|'reconcile':\s*\[([\s\S]*?)\n {4}\],/.exec(
        plan
    )
    const text = block?.[1] ?? block?.[2] ?? ''
    return [...text.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1])
}

// The rows of the topic's key table: the lines of the body that start with "|".
const tableRows = body.split('\n').filter(line => line.trimStart().startsWith('|'))

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

// A key stands alone in its cell: bounded by a space, a pipe, a backtick or a comma.
function namesKey(row: string, key: string): boolean {
    return new RegExp(`(^|[\\s|\`,])${escapeRegExp(key)}($|[\\s|\`,])`).test(row)
}

describe('help/reconcile.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has its title, a summary and its tags in the frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*Reconcile an account\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
        const tags = /^tags:\s*\[([^\]]*)\]\s*$/m.exec(frontmatter)?.[1] ?? ''
        const names = tags.split(',').map(tag => tag.trim().replace(/^["']|["']$/g, ''))
        expect(names).toEqual(expect.arrayContaining(['reconcile', 'banking', 'statement']))
    })

    it('sorts after the Match a bank transaction topic', () => {
        expect(orderOf(frontmatter)).toBeGreaterThan(
            orderOf(readHelpTopic('bank-match').frontmatter)
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
        '⌘S',
        '⌘↵',
        'J',
        'K',
        'X',
        'O',
        'A',
        'M',
        '/',
        '1',
        '2',
        '3',
        'E',
        'R',
    ])('lists the key %s in its key table', key => {
        expect(topicExists).toBe(true)
        expect(
            tableRows.some(row => namesKey(row, key)),
            `no table row names ${key}`
        ).toBe(true)
    })

    it('writes the ⌘ keys as text, so the viewer can show Ctrl on other systems', () => {
        expect(body).toContain('⌘S')
        expect(body).toContain('⌘↵')
        expect(body).not.toContain('`⌘S`')
        expect(body).not.toContain('`⌘↵`')
    })

    it('has no Ctrl keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
    })

    it('names only images that help/screenshots.ts plans for the topic', () => {
        expect(topicExists).toBe(true)
        const shots = plannedShots()
        expect(shots).toEqual(['reconcile-1', 'reconcile-2', 'reconcile-3'])
        const images = [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1])
        expect(images.length).toBeGreaterThan(0)
        for (const image of images) {
            expect(image.startsWith('images/'), image).toBe(true)
            expect(shots, image).toContain(path.basename(image, '.png'))
        }
    })
})

describe.each([
    'banking',
    'account-register',
    'bank-match',
    'navigating-books',
])('help/%s.md', id => {
    it('links to the Reconcile an account topic', () => {
        expect(readHelpTopic(id).source).toContain('help://books:reconcile')
    })
})
