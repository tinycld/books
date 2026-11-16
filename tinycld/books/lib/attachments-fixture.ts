// Synthetic attachments for the helix reference route, the seed (seed.ts) and tests.
// Plain data: it imports other fixtures and types only, because the seed graph runs in
// plain node (tests/seed-node.test.ts).
//
// AttachmentRecord is the generated `books_attachments` row (pb-migrations/
// 2100000020_create_books_attachments.js): exactly one of `bill` and `expense` is set (a Go
// guard enforces it); `field` is empty for the Attachments section and a custom File
// field's key otherwise; `file` is the stored file name PocketBase assigns; `name` is the
// upload's original name, trimmed to 255 characters by the server.
//
// `mime_type` is a fixture column, not a schema field: PocketBase keeps only the stored
// file name, and the client reads the type from the upload (or from the file name's
// extension). The seed sends a small file of that type (lib/attachment-seed-files.ts).
//
// The section lists only rows whose `field` is empty; a row with a `field` key belongs to
// a custom File field on the bill or expense form (spec §3.8).

import type { BooksAttachments } from '../types'
import { BILL_IDS } from './bill-form-fixture'
import { EXPENSE_IDS } from './expense-form-fixture'
import { INVOICE_USER_IDS, INVOICE_USER_NAMES } from './invoice-form-fixture'

export type AttachmentRecord = BooksAttachments

export type AttachmentFixtureRow = AttachmentRecord & { mime_type: string }

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_DOCUMENT = 25

// The users the rows name as uploader ("1.2 MB · Ana Ruiz, Nov 13").
export const ATTACHMENT_USER_IDS = INVOICE_USER_IDS
export const ATTACHMENT_USER_NAMES = INVOICE_USER_NAMES

const LONG_NAME =
    'Office Supply World - signed delivery confirmation for the Q4 front-office restock, scanned at the loading dock.pdf'

export const ATTACHMENT_IDS = {
    // Bill 1002, Office Supply World (posted): the vendor's PDF bill, a packing-slip photo,
    // a long scanned delivery note, and a W-9 held by a custom File field.
    billPdf: 'attbill1002pdf1',
    billPhoto: 'attbill1002png1',
    billLong: 'attbill1002lng1',
    billCustomField: 'attbill1002w9f1',
    // Bill 1003, Summit IT Services (posted): the original of the correction state.
    summitPdf: 'attbill1003pdf1',
    summitSheet: 'attbill1003xls1',
    // Bill 1001, Metro Commercial Properties (void): read only.
    voidedPdf: 'attbill1001pdf1',
    // Expense 1003, Office Supply World (posted): the card receipt photo.
    expenseReceipt: 'attexp1003jpg01',
    // Expense 1002, Pacific Power (posted): a meter photo from an iPhone, which the
    // server gives a generated thumbnail (a browser cannot draw a HEIC).
    expenseHeic: 'attexp1002heic1',
} as const

const IDS = ATTACHMENT_IDS

type AttachmentSeed = Pick<AttachmentFixtureRow, 'id' | 'name' | 'mime_type' | 'size' | 'created'> &
    Partial<AttachmentFixtureRow>

function attachment(seed: AttachmentSeed): AttachmentFixtureRow {
    return {
        bill: '',
        expense: '',
        field: '',
        file: seed.name.toLowerCase().replaceAll(' ', '_'),
        // The server stores a generated thumbnail after the upload; fixture rows have none.
        thumbnail: '',
        uploaded_by: ATTACHMENT_USER_IDS.ana,
        updated: seed.created,
        ...seed,
    }
}

// Upload order (oldest first) within each document, as the section lists them.
export const ATTACHMENTS = [
    attachment({
        id: IDS.billPdf,
        bill: BILL_IDS.posted,
        name: 'OSW-invoice-1002.pdf',
        mime_type: 'application/pdf',
        size: 188_416,
        created: '2026-11-13 09:12:00.000Z',
    }),
    attachment({
        id: IDS.billPhoto,
        bill: BILL_IDS.posted,
        name: 'packing-slip-photo.png',
        mime_type: 'image/png',
        size: 2_516_582,
        uploaded_by: ATTACHMENT_USER_IDS.omar,
        created: '2026-11-13 10:40:00.000Z',
    }),
    attachment({
        id: IDS.billLong,
        bill: BILL_IDS.posted,
        name: LONG_NAME,
        mime_type: 'application/pdf',
        size: 4_194_304,
        uploaded_by: ATTACHMENT_USER_IDS.omar,
        created: '2026-11-14 08:05:00.000Z',
    }),
    attachment({
        id: IDS.billCustomField,
        bill: BILL_IDS.posted,
        field: 'w9_form',
        name: 'office-supply-world-w9.pdf',
        mime_type: 'application/pdf',
        size: 96_256,
        created: '2026-11-14 08:30:00.000Z',
    }),
    attachment({
        id: IDS.summitPdf,
        bill: BILL_IDS.summit,
        name: 'summit-it-invoice-october.pdf',
        mime_type: 'application/pdf',
        size: 225_280,
        created: '2026-11-02 14:00:00.000Z',
    }),
    attachment({
        id: IDS.summitSheet,
        bill: BILL_IDS.summit,
        name: 'managed-services-breakdown.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 51_200,
        created: '2026-11-02 14:02:00.000Z',
    }),
    attachment({
        id: IDS.voidedPdf,
        bill: BILL_IDS.voided,
        name: 'metro-rent-october.pdf',
        mime_type: 'application/pdf',
        size: 98_304,
        uploaded_by: ATTACHMENT_USER_IDS.omar,
        created: '2026-10-02 11:00:00.000Z',
    }),
    attachment({
        id: IDS.expenseReceipt,
        expense: EXPENSE_IDS.officeSupply,
        name: 'receipt-office-supply-world.jpg',
        mime_type: 'image/jpeg',
        size: 1_153_434,
        created: '2026-11-12 15:14:00.000Z',
    }),
    attachment({
        id: IDS.expenseHeic,
        expense: EXPENSE_IDS.pacificPower,
        name: 'pacific-power-meter.heic',
        mime_type: 'image/heic',
        size: 532,
        created: '2026-11-12 16:02:00.000Z',
    }),
] satisfies AttachmentFixtureRow[]

export const EMPTY_ATTACHMENTS: AttachmentFixtureRow[] = []

// The rows the Attachments section of one document lists: its own, no custom-field rows,
// oldest first.
export function sectionAttachments(parent: { bill?: string; expense?: string }) {
    return ATTACHMENTS.filter(
        row =>
            row.field === '' &&
            ((parent.bill !== undefined && row.bill === parent.bill) ||
                (parent.expense !== undefined && row.expense === parent.expense))
    ).sort((a, b) => a.created.localeCompare(b.created))
}

// Files a writer has picked or dropped that are not stored yet (the form's pending
// files), and the in-flight and failed states of an upload. Only the reference route and
// tests use these; they never reach the database.
export type AttachmentUploadState =
    | { kind: 'pending' }
    | { kind: 'uploading'; percent: number }
    | { kind: 'failed'; message: string }

export interface AttachmentDraftRow {
    key: string
    name: string
    mime_type: string
    size: number
    state: AttachmentUploadState
}

export const PENDING_ATTACHMENTS: AttachmentDraftRow[] = [
    {
        key: 'pending-receipt',
        name: 'toner-receipt-scan.jpg',
        mime_type: 'image/jpeg',
        size: 2_411_725,
        state: { kind: 'pending' },
    },
    {
        key: 'uploading-heic',
        name: 'IMG_2041.heic',
        mime_type: 'image/heic',
        size: 3_145_728,
        state: { kind: 'uploading', percent: 45 },
    },
]

// A server refusal (the storage quota, a 413) and a transport failure, as the row shows
// them through Books `uploadErrorText` (lib/upload-errors.ts).
export const FAILED_ATTACHMENTS: AttachmentDraftRow[] = [
    {
        key: 'failed-quota',
        name: 'managed-services-breakdown-november.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 61_440,
        state: {
            kind: 'failed',
            message:
                'Organization storage limit exceeded: 10.0 GB used of 10.0 GB limit, 0 B available but 60.0 KB requested.',
        },
    },
    {
        key: 'failed-transport',
        name: 'summit-signed-sow.pdf',
        mime_type: 'application/pdf',
        size: 312_320,
        state: {
            kind: 'failed',
            message: 'The file could not be uploaded. Check your connection and try again.',
        },
    },
]

// The refusals the client shows under the add area (spec §3.2), with the files that cause
// them.
export const REFUSED_FILES = {
    tooLarge: { name: 'warehouse-walkthrough.mov', size: 48_234_496 },
    wrongType: { name: 'vendor-portal-export.html', size: 12_288 },
} as const

export const ATTACHMENT_REFUSALS = {
    tooLarge: `${REFUSED_FILES.tooLarge.name} is larger than 20 MB.`,
    wrongType: `${REFUSED_FILES.wrongType.name} is not a file type Books keeps. Attach a PDF, an image, or an office or text file.`,
    billLimit: 'A bill holds at most 25 attachments.',
    expenseLimit: 'An expense holds at most 25 attachments.',
} as const

// The seed's files (spec §4 Seed): one PDF and one PNG on posted bill 1002, the W-9 of a
// custom File field on the same bill (so the e2e proves the section hides it), one JPEG
// receipt on posted expense 1003, and one HEIC photo on posted expense 1002 (so the e2e
// reads the thumbnail the server generates). lib/attachment-seed-files.ts holds a few KB
// of bytes of each type.
export const SEED_ATTACHMENT_IDS = [
    IDS.billPdf,
    IDS.billPhoto,
    IDS.billCustomField,
    IDS.expenseReceipt,
    IDS.expenseHeic,
] as const
