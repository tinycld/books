import { describe, expect, it } from 'vitest'
import {
    ATTACHMENT_IDS,
    ATTACHMENTS,
    type AttachmentRecord,
    FAILED_ATTACHMENTS,
    MAX_ATTACHMENTS_PER_DOCUMENT,
    SEED_ATTACHMENT_IDS,
} from '../tinycld/books/lib/attachments-fixture'
import { BILL_IDS } from '../tinycld/books/lib/bill-form-fixture'
import { EXPENSE_IDS } from '../tinycld/books/lib/expense-form-fixture'
import type { BooksAttachments } from '../tinycld/books/types'

// The attachments fixture (spec §4): the rows the reference route, the seed and the e2e
// read. The type checks are tsc's: it refuses them until the books_attachments migration
// exists, the types are generated again, and AttachmentRecord is the generated row.
const fromGenerated = (row: BooksAttachments): AttachmentRecord => row
const toGenerated = (row: AttachmentRecord): BooksAttachments => row

// Spec §4, the file field's mimeTypes.
const ALLOW_LIST = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const MAGIC: Record<string, number[]> = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'image/png': [0x89, 0x50, 0x4e, 0x47], // \x89PNG
    'image/jpeg': [0xff, 0xd8, 0xff],
}

const QUOTA_TEXT =
    'Organization storage limit exceeded: 10.0 GB used of 10.0 GB limit, 0 B available but 60.0 KB requested.'

function decode(base64: string) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

describe('attachments fixture', () => {
    it('types every row as the generated books_attachments row plus mime_type', () => {
        const rows = ATTACHMENTS satisfies (BooksAttachments & { mime_type: string })[]
        const [row] = rows
        if (!row) throw new Error('no attachment rows')
        const first = toGenerated(fromGenerated(row))
        expect(first.id).toBe(ATTACHMENT_IDS.billPdf)
        expect(first.bill).toBe(BILL_IDS.posted)
    })

    it('sets exactly one parent on every row, a fixture bill or expense', () => {
        const bills = new Set<string>(Object.values(BILL_IDS))
        const expenses = new Set<string>(Object.values(EXPENSE_IDS))
        for (const row of ATTACHMENTS) {
            expect(row.bill !== '' && row.expense !== '', row.id).toBe(false)
            expect(row.bill === '' && row.expense === '', row.id).toBe(false)
            const known = row.bill !== '' ? bills.has(row.bill) : expenses.has(row.expense)
            expect(known, row.id).toBe(true)
        }
    })

    it('gives every row a 15-character PocketBase id', () => {
        for (const row of ATTACHMENTS) expect(row.id, row.id).toMatch(/^[a-z0-9]{15}$/)
    })

    it('uses only allow-listed types', () => {
        for (const row of ATTACHMENTS) expect(ALLOW_LIST, row.id).toContain(row.mime_type)
    })

    it('holds no more than 25 rows on one document', () => {
        expect(MAX_ATTACHMENTS_PER_DOCUMENT).toBe(25)
        const perDocument = new Map<string, number>()
        for (const row of ATTACHMENTS) {
            const key = row.bill !== '' ? `bill:${row.bill}` : `expense:${row.expense}`
            perDocument.set(key, (perDocument.get(key) ?? 0) + 1)
        }
        for (const [key, count] of perDocument) {
            expect(count, key).toBeLessThanOrEqual(MAX_ATTACHMENTS_PER_DOCUMENT)
        }
    })

    // The seed's files (spec §4 Seed) plus the W-9 custom-field row, so the e2e proves
    // the section hides a custom File field's row.
    it('seeds the bill PDF, the packing-slip photo, the W-9 and the expense receipt', () => {
        expect([...SEED_ATTACHMENT_IDS]).toEqual([
            ATTACHMENT_IDS.billPdf,
            ATTACHMENT_IDS.billPhoto,
            ATTACHMENT_IDS.billCustomField,
            ATTACHMENT_IDS.expenseReceipt,
        ])
        expect([...SEED_ATTACHMENT_IDS]).toEqual([
            'attbill1002pdf1',
            'attbill1002png1',
            'attbill1002w9f1',
            'attexp1003jpg01',
        ])
    })

    it('has small real bytes of its type for every seeded row', async () => {
        const { ATTACHMENT_SEED_FILES } = await import('../tinycld/books/lib/attachment-seed-files')
        expect(Object.keys(ATTACHMENT_SEED_FILES).sort()).toEqual([...SEED_ATTACHMENT_IDS].sort())
        for (const id of SEED_ATTACHMENT_IDS) {
            const row = ATTACHMENTS.find(r => r.id === id)
            if (!row) throw new Error(`no fixture row ${id}`)
            const bytes = decode(ATTACHMENT_SEED_FILES[id])
            expect(bytes.length, id).toBeGreaterThan(0)
            expect(bytes.length, id).toBeLessThan(8 * 1024)
            const magic = MAGIC[row.mime_type]
            if (!magic) throw new Error(`no magic bytes for ${row.mime_type}`)
            expect([...bytes.slice(0, magic.length)], id).toEqual(magic)
        }
    })

    // Core quota.ExceededError's text, sentenized by PocketBase, as Books uploadErrorText
    // shows it on the row.
    it('shows the core quota refusal on the failed upload', () => {
        const [failed] = FAILED_ATTACHMENTS
        expect(failed?.state).toEqual({ kind: 'failed', message: QUOTA_TEXT })
    })
})
