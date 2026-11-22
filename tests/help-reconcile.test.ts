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
        expect(shots).toEqual([
            'reconcile-1',
            'reconcile-2',
            'reconcile-3',
            'reconcile-4',
            'reconcile-5',
            'reconcile-6',
        ])
        const images = [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1])
        expect(images.length).toBeGreaterThan(0)
        for (const image of images) {
            expect(image.startsWith('images/'), image).toBe(true)
            expect(shots, image).toContain(path.basename(image, '.png'))
        }
    })
})

// Reconciliation report spec §4 "Help" (plan checkpoint 4): the history, the report and
// the undo.

// The body under `heading`, up to the next second-level heading.
function section(heading: string): string {
    const start = body.indexOf(`${heading}\n`)
    if (start < 0) return ''
    const rest = body.slice(start + heading.length)
    const next = rest.search(/^## /m)
    return next < 0 ? rest : rest.slice(0, next)
}

function inOneSentence(text: string, ...phrases: RegExp[]): boolean {
    return text.split(/(?<=[.!?])\s+/).some(s => phrases.every(phrase => phrase.test(s)))
}

// The rows of the key table that follows the first line naming the History tab in the
// "Keyboard shortcuts" section.
function historyKeyRows(): string[] {
    const lines = section('## Keyboard shortcuts').split('\n')
    const intro = lines.findIndex(
        line => !line.trimStart().startsWith('|') && /\bHistory\b/.test(line)
    )
    if (intro < 0) return []
    const rows: string[] = []
    for (const line of lines.slice(intro + 1)) {
        if (line.trimStart().startsWith('|')) rows.push(line)
        else if (rows.length > 0) break
    }
    return rows
}

describe('help/reconcile.md: history, report and undo', () => {
    it.each([
        '## See past reconciliations',
        '## Open the reconciliation report',
        '## Undo a reconciliation',
    ])('has the heading "%s"', heading => {
        expect(body).toMatch(new RegExp(`^${heading}$`, 'm'))
    })

    describe('the "Undo a reconciliation" section', () => {
        const undo = section('## Undo a reconciliation')

        it('says only a Books admin can undo, in one sentence', () => {
            expect(inOneSentence(undo, /\bonly\b/i, /\bBooks admin\b/i, /\bundo\b/i)).toBe(true)
        })

        it('says only the latest reconciliation of an account can be undone, in one sentence', () => {
            expect(
                inOneSentence(
                    undo,
                    /\bonly\b/i,
                    /\blatest reconciliation\b/i,
                    /\baccount\b/i,
                    /\bundo(ne)?\b/i
                )
            ).toBe(true)
        })

        it('says the transactions stay cleared, in one sentence', () => {
            expect(inOneSentence(undo, /\btransactions\b/i, /\bstay cleared\b/i)).toBe(true)
        })
    })

    it.each(['J', 'K', 'O', 'R'])('lists the key %s in the History key table', key => {
        const rows = historyKeyRows()
        expect(rows.length, 'a key table after a line that names the History tab').toBeGreaterThan(
            0
        )
        expect(
            rows.some(row => namesKey(row, key)),
            `no History table row names ${key}`
        ).toBe(true)
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
