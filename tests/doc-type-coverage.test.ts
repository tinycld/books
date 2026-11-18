import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOC_TYPE } from '../tinycld/books/lib/audit-fields'
import { ROUTED_DOC_TYPES } from '../tinycld/books/lib/audit-record-route'
import { fieldValues, migrationField } from './migration-field'

const MIGRATIONS = join(__dirname, '..', 'pb-migrations')

// The migrations whose text declares a `doc_type` field; `migrationField` throws for a
// file with none, so the folder is scanned first.
function docTypeFiles(): string[] {
    return readdirSync(MIGRATIONS)
        .filter(file => file.endsWith('.js'))
        .filter(file =>
            /\{\s*name:\s*'doc_type'/.test(readFileSync(join(MIGRATIONS, file), 'utf8'))
        )
        .sort()
}

describe('doc_type coverage', () => {
    it('labels every doc_type value of every migration in DOC_TYPE', () => {
        const files = docTypeFiles()
        expect(files.length).toBeGreaterThanOrEqual(2)
        const labelled = DOC_TYPE.map(option => option.value)
        const missing: string[] = []
        for (const file of files) {
            const field = migrationField(file, 'doc_type')
            expect(field).toMatch(/type:\s*'select'/)
            for (const value of fieldValues(field)) {
                if (!labelled.includes(value)) missing.push(`${file}: ${value}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('labels bill_payment "Bill payment", after payment', () => {
        const values = DOC_TYPE.map(option => option.value)
        expect(DOC_TYPE).toContainEqual({ value: 'bill_payment', label: 'Bill payment' })
        expect(values.indexOf('bill_payment')).toBe(values.indexOf('payment') + 1)
    })

    it("routes every doc_type of a journal entry (books_journal_entries' field)", () => {
        const values = fieldValues(migrationField('2100000002_create_books_ledger.js', 'doc_type'))
        expect(values.length).toBeGreaterThan(0)
        expect(values.filter(value => !ROUTED_DOC_TYPES.includes(value))).toEqual([])
    })
})
