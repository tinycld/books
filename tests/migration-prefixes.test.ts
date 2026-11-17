import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// PocketBase applies migrations in file-name order and records them by name: two files with
// the same numeric prefix (two lanes that picked the same next number) run in an order
// nobody chose.
describe('pb-migrations prefixes', () => {
    it('gives no two migration files the same numeric prefix', () => {
        const files = readdirSync(join(__dirname, '..', 'pb-migrations')).filter(file =>
            file.endsWith('.js')
        )
        expect(files.length).toBeGreaterThan(0)
        const prefixes = files.map(file => file.split('_')[0])
        for (const prefix of prefixes) expect(prefix).toMatch(/^\d+$/)
        const shared = prefixes.filter((prefix, i) => prefixes.indexOf(prefix) !== i)
        expect(shared).toEqual([])
    })
})
