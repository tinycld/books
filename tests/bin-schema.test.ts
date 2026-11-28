import { describe, expect, it } from 'vitest'
import { type BinValues, binSchema } from '../tinycld/books/lib/bin-schema'

// The bin dialog's one zod schema (inventory-adjust spec §3.7 "New bin location"): Name
// required and at most 100 characters, Note at most 500, Inactive only on an edit. The
// unique name is the server's rule (its refusal lands on Name).

function issuePaths(values: unknown): string[] {
    const result = binSchema.safeParse(values)
    if (result.success) return []
    return result.error.issues.map(issue => issue.path.join('.'))
}

const NEW_BIN: BinValues = { name: 'Aisle 9', note: '' }

describe('binSchema', () => {
    it('accepts a new bin with a name and no note', () => {
        expect(issuePaths(NEW_BIN)).toEqual([])
    })

    it.each(['', '   ', '\t\n'])('refuses the blank name %j', name => {
        expect(issuePaths({ ...NEW_BIN, name })).toEqual(['name'])
    })

    it('refuses a name of 101 characters and keeps one of 100', () => {
        expect(issuePaths({ ...NEW_BIN, name: 'n'.repeat(101) })).toEqual(['name'])
        expect(issuePaths({ ...NEW_BIN, name: 'n'.repeat(100) })).toEqual([])
    })

    it('refuses a note of 501 characters and keeps one of 500', () => {
        expect(issuePaths({ ...NEW_BIN, note: 'x'.repeat(501) })).toEqual(['note'])
        expect(issuePaths({ ...NEW_BIN, note: 'x'.repeat(500) })).toEqual([])
    })

    // A new bin's values have no Inactive (the dialog draws it on an edit only), and an
    // edit keeps the value it sets.
    it('has Inactive only in the values of an edit', () => {
        const created = binSchema.parse(NEW_BIN)
        expect(created).not.toHaveProperty('inactive')

        const edited: BinValues = { name: 'Aisle 9', note: 'Top shelf', inactive: true }
        expect(binSchema.parse(edited)).toEqual(edited)
        expect(binSchema.parse({ ...edited, inactive: false }).inactive).toBe(false)
    })
})
