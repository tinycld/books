import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Carried check 2 (vendor credit spec, checkpoint 1): PocketBase runs migrations in file
// name order, and two files with one numeric prefix run in an order no one chose. The
// audit log view reads every audited collection, so it must run last.

const MIGRATIONS = readdirSync(join(__dirname, '..', 'pb-migrations'))
    .filter(file => file.endsWith('.js'))
    .sort()

function prefixOf(file: string): string {
    return file.split('_')[0] ?? file
}

describe('pb-migrations prefixes', () => {
    it('gives every migration a numeric prefix before the first _', () => {
        expect(MIGRATIONS.length).toBeGreaterThan(0)
        expect(MIGRATIONS.filter(file => !/^\d+$/.test(prefixOf(file)))).toEqual([])
    })

    it('never gives two migrations the same numeric prefix', () => {
        const byPrefix = new Map<string, string[]>()
        for (const file of MIGRATIONS) {
            byPrefix.set(prefixOf(file), [...(byPrefix.get(prefixOf(file)) ?? []), file])
        }
        const shared = [...byPrefix.values()]
            .filter(files => files.length > 1)
            .map(files => files.join(' and '))
        expect(shared).toEqual([])
    })

    it('runs the audit log view last', () => {
        const highest = MIGRATIONS.reduce((top, file) =>
            Number(prefixOf(file)) > Number(prefixOf(top)) ? file : top
        )
        expect(highest).toMatch(/^\d+_create_books_audit_log\.js$/)
    })

    // Spec §4: the vendor credits take 2100000023 and the audit view moves to 2100000024.
    it('holds the vendor credits migration at 2100000023, before the audit log at 2100000024', () => {
        expect(MIGRATIONS).toContain('2100000023_create_books_vendor_credits.js')
        expect(MIGRATIONS).toContain('2100000024_create_books_audit_log.js')
        expect(MIGRATIONS).not.toContain('2100000023_create_books_audit_log.js')
    })
})
