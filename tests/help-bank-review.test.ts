import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readHelpTopic } from './help-topic'

const helpDir = path.resolve(__dirname, '../help')

const { exists: topicExists, source, frontmatter, body } = readHelpTopic('bank-review')

describe('help/bank-review.md', () => {
    it('exists', () => {
        expect(topicExists).toBe(true)
    })

    it('has its title, a summary and its tags in the frontmatter', () => {
        expect(frontmatter).toMatch(/^title:\s*Review bank transactions\s*$/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
        const tags = /^tags:\s*\[([^\]]*)\]\s*$/m.exec(frontmatter)?.[1] ?? ''
        const names = tags.split(',').map(tag => tag.trim().replace(/^["']|["']$/g, ''))
        expect(names).toEqual(expect.arrayContaining(['banking', 'review', 'exclude']))
    })

    it('links only to topics that exist', () => {
        expect(topicExists).toBe(true)
        const ids = [...source.matchAll(/help:\/\/books:([a-z0-9-]+)/g)].map(m => m[1])
        for (const id of ids) {
            expect(existsSync(path.join(helpDir, `${id}.md`)), `help://books:${id}`).toBe(true)
        }
    })

    it.each([
        'for review',
        'reviewed',
        'excluded',
        'files',
        'search',
        'amount',
        'dates',
        'money in',
        'money out',
        'exclude',
        'move to for review',
        'nothing posts',
        'select all',
    ])('mentions "%s"', phrase => {
        expect(body.toLowerCase()).toContain(phrase)
    })

    it('says who can act (read-only or bookkeeper access)', () => {
        const text = body.toLowerCase()
        expect(text.includes('read-only') || text.includes('bookkeeper access')).toBe(true)
    })

    it.each(['↓', '↑', '↵', '/', 'Esc'])('names the key %s', key => {
        expect(body).toContain(key)
    })

    it.each(['J', 'K', 'X', 'O', 'A', 'E', 'R', '1', '2', '3', '4'])('names the key %s', key => {
        expect(body).toMatch(new RegExp(`\\b${key}\\b`))
    })

    it('has no Ctrl keyboard text', () => {
        expect(topicExists).toBe(true)
        expect(body).not.toMatch(/\bCtrl\b/i)
    })

    it('names only images that exist in help/images', () => {
        expect(topicExists).toBe(true)
        const images = [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1])
        for (const image of images) {
            expect(existsSync(path.join(helpDir, image)), image).toBe(true)
            expect(image.startsWith('images/'), image).toBe(true)
        }
    })
})
