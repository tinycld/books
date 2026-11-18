import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { uploadFileToPickedFile } from '@tinycld/core/file-viewer/picked-file'
import { ClientResponseError } from 'pocketbase'
import { beforeEach, describe, expect, it } from 'vitest'
import {
    attachmentControls,
    attachmentCount,
    attachmentDetailText,
    attachmentIssue,
    attachmentMimeOf,
    attachmentParentColumn,
    attachmentPreviewSource,
    attachmentsHeading,
    attachmentsNotSavedText,
    fromDocumentText,
    movedText,
    pendingDetailText,
    removeMessage,
    splitAttachmentRows,
    uploadingText,
} from '../tinycld/books/lib/attachments'
import {
    ATTACHMENT_IDS,
    ATTACHMENT_REFUSALS,
    ATTACHMENTS,
    MAX_ATTACHMENT_BYTES,
    REFUSED_FILES,
} from '../tinycld/books/lib/attachments-fixture'
import { BILL_IDS } from '../tinycld/books/lib/bill-form-fixture'
import { writeRefusalText } from '../tinycld/books/lib/refusal'
import {
    BILL_KIND,
    EXPENSE_KIND,
    VENDOR_CREDIT_KIND,
} from '../tinycld/books/lib/sales-document-kinds'
import { useAttachmentsStore } from '../tinycld/books/stores/attachments-store'

function fixtureRow(id: string) {
    const row = ATTACHMENTS.find(r => r.id === id)
    if (!row) throw new Error(`no attachment ${id} in the fixture`)
    return { ...row, uploaderName: 'Ana Ruiz' as string | undefined }
}

const PDF = { name: 'scan.pdf', type: 'application/pdf', size: 1_000 }

// The client's type check (spec §3.2): the reported MIME type, or the extension when the
// reported type is empty.
describe('attachmentMimeOf', () => {
    it('reads the type from the extension, in any case, when the file reports none', () => {
        expect(attachmentMimeOf('scan.PDF', '')).toBe('application/pdf')
        expect(attachmentMimeOf('a.heic', '')).toBe('image/heic')
    })

    it('is empty for an extension off the allow-list', () => {
        expect(attachmentMimeOf('x.bin', '')).toBe('')
    })

    it('keeps the reported type', () => {
        expect(attachmentMimeOf('a.jpg', 'image/jpeg')).toBe('image/jpeg')
    })
})

// Every file is checked before upload (spec §3.2): size, type, then the document's count.
describe('attachmentIssue', () => {
    it('refuses a file over 20 MB', () => {
        const file = { ...REFUSED_FILES.tooLarge, type: 'video/quicktime' }
        expect(attachmentIssue(file, BILL_KIND, 0)).toBe(ATTACHMENT_REFUSALS.tooLarge)
    })

    it('takes a file of exactly 20 MB', () => {
        expect(attachmentIssue({ ...PDF, size: MAX_ATTACHMENT_BYTES }, BILL_KIND, 0)).toBeNull()
    })

    it('refuses a type off the allow-list', () => {
        const file = { ...REFUSED_FILES.wrongType, type: 'text/html' }
        expect(attachmentIssue(file, BILL_KIND, 0)).toBe(ATTACHMENT_REFUSALS.wrongType)
    })

    it('takes a .csv that reports no type, by its extension', () => {
        expect(attachmentIssue({ name: 'notes.csv', type: '', size: 120 }, BILL_KIND, 0)).toBeNull()
    })

    it('refuses an SVG', () => {
        const file = { name: 'logo.svg', type: 'image/svg+xml', size: 2_048 }
        expect(attachmentIssue(file, BILL_KIND, 0)).toBe(
            'logo.svg is not a file type Books keeps. Attach a PDF, an image, or an office or text file.'
        )
    })

    it('refuses the 26th attachment of a bill and of an expense', () => {
        expect(attachmentIssue(PDF, BILL_KIND, 25)).toBe(ATTACHMENT_REFUSALS.billLimit)
        expect(attachmentIssue(PDF, EXPENSE_KIND, 25)).toBe(ATTACHMENT_REFUSALS.expenseLimit)
    })

    it('takes the 25th attachment', () => {
        expect(attachmentIssue(PDF, BILL_KIND, 24)).toBeNull()
    })

    // Vendor credit spec §3.12: a vendor credit is the third parent, with its own limit text.
    it('refuses the 26th attachment of a vendor credit with the vendor credit text', () => {
        expect(attachmentIssue(PDF, VENDOR_CREDIT_KIND, 25)).toBe(
            'A vendor credit holds at most 25 attachments.'
        )
        expect(attachmentIssue(PDF, VENDOR_CREDIT_KIND, 24)).toBeNull()
    })
})

// The column of books_attachments that names a document of the kind (vendor credit spec
// §3.12): the bill's, the expense's, and the vendor credit's own.
describe('attachmentParentColumn', () => {
    it('names bill, expense and vendor_credit by the kind', () => {
        expect(attachmentParentColumn(BILL_KIND)).toBe('bill')
        expect(attachmentParentColumn(EXPENSE_KIND)).toBe('expense')
        expect(attachmentParentColumn(VENDOR_CREDIT_KIND)).toBe('vendor_credit')
    })
})

// The read view's count (plan checkpoint 3, useAttachmentUpload.addFiles): stored rows +
// the session's drafts (uploading or failed) − its marked removals, through the same
// attachmentCount the hook calls.
describe("attachmentIssue with the read view's count", () => {
    const sessionKey = 'read:bill-count'

    function readViewCount(stored: number) {
        return attachmentCount(stored, useAttachmentsStore.getState().sessions[sessionKey])
    }

    beforeEach(() => {
        useAttachmentsStore.setState({ sessions: {} })
        useAttachmentsStore.getState().open(sessionKey)
    })

    it('refuses the 26th file when 24 are stored and one is uploading', () => {
        const uploading = uploadFileToPickedFile(new File(['%PDF-1.4'], 'one.pdf'))
        useAttachmentsStore.getState().add(sessionKey, [
            {
                key: 'k1',
                file: uploading,
                name: 'one.pdf',
                mimeType: 'application/pdf',
                size: uploading.size,
                state: { kind: 'uploading', percent: 45 },
            },
        ])
        expect(readViewCount(24)).toBe(25)
        expect(attachmentIssue(PDF, BILL_KIND, readViewCount(24))).toBe(
            'A bill holds at most 25 attachments.'
        )
    })

    it('takes a file when 25 are stored and one is marked for removal', () => {
        useAttachmentsStore.getState().markRemoval(sessionKey, 'att25')
        expect(readViewCount(25)).toBe(24)
        expect(attachmentIssue(PDF, BILL_KIND, readViewCount(25))).toBeNull()
    })
})

// A refused delete shows the server's message on the row (plan Decisions "Refusal text on
// a row"), through writeRefusalText, not uploadErrorText.
describe('a refused attachment delete', () => {
    it("shows the server's void refusal as written", () => {
        const message = "This bill is void. Its attachments can't change."
        const error = new ClientResponseError({
            url: 'http://127.0.0.1/api/collections/books_attachments/records/att1',
            status: 400,
            response: { code: 400, message, data: {} },
        })
        expect(writeRefusalText(error)).toBe(message)
    })
})

describe('the section texts', () => {
    it('counts the files in the heading only when there are some', () => {
        expect(attachmentsHeading(0)).toBe('Attachments')
        expect(attachmentsHeading(2)).toBe('Attachments (2)')
    })

    it("gives a stored row's size, uploader and UTC upload day", () => {
        const row = {
            ...fixtureRow(ATTACHMENT_IDS.billPdf),
            size: 1_258_291,
            created: '2026-11-14 23:30:00.000Z',
        }
        expect(attachmentDetailText(row)).toBe('1.2 MB · Ana Ruiz, Nov 14')
        expect(attachmentDetailText({ ...row, uploaderName: undefined })).toBe('1.2 MB · Nov 14')
    })

    it('labels a pending and an uploading row', () => {
        expect(pendingDetailText(1_258_291)).toBe('1.2 MB · Not saved yet')
        expect(uploadingText(45)).toBe('Uploading… 45%')
    })

    it("names a correction's group and a replaced original's move", () => {
        expect(fromDocumentText('Bill', '1003')).toBe('From Bill 1003')
        expect(movedText('1003')).toBe('Moved to 1003 (edited)')
    })

    it('asks before a remove with the lower-cased noun', () => {
        expect(removeMessage('a.pdf', 'Bill')).toEqual({
            title: 'Remove a.pdf?',
            message: 'It is deleted from this bill.',
        })
    })

    it('tells how many attachments a save left behind', () => {
        expect(attachmentsNotSavedText('Bill', 1)).toBe(
            'The bill was saved as a draft. 1 attachment did not upload. Save draft or Post tries it again.'
        )
        expect(attachmentsNotSavedText('Expense', 2)).toBe(
            'The expense was saved as a draft. 2 attachments did not upload. Save draft or Post tries them again.'
        )
    })
})

describe('attachmentPreviewSource', () => {
    it("opens the stored file under its upload name and the name's type", () => {
        const row = fixtureRow(ATTACHMENT_IDS.billPdf)
        expect(attachmentPreviewSource(row)).toEqual({
            collectionId: 'books_attachments',
            recordId: row.id,
            fileName: row.file,
            displayName: row.name,
            mimeType: attachmentMimeOf(row.name, ''),
            size: row.size,
        })
    })

    // Revise 1: core pickThumbnailBase thumbnails the generated file when the source
    // names one.
    it('names the generated thumbnail file when the row has one', () => {
        const row = {
            ...fixtureRow(ATTACHMENT_IDS.billPdf),
            thumbnail: 'osw_invoice_1002_thumb_k3j2h1.jpg',
        }
        expect(attachmentPreviewSource(row).thumbnailFileName).toBe(
            'osw_invoice_1002_thumb_k3j2h1.jpg'
        )
    })

    it('names no thumbnail file when the row has none', () => {
        const row = { ...fixtureRow(ATTACHMENT_IDS.billPdf), thumbnail: '' }
        expect(Object.hasOwn(attachmentPreviewSource(row), 'thumbnailFileName')).toBe(false)
    })
})

// Who sees add and Remove (spec §3.1, §3.3, §3.5).
describe('attachmentControls', () => {
    const writer = { canWrite: true, isVoid: false, isDisabled: false, isLoading: false }

    it('gives a writer on a live document add and Remove', () => {
        expect(attachmentControls(writer)).toMatchObject({
            showsAdd: true,
            showsRemove: true,
            isAddDisabled: false,
        })
    })

    it('gives a reader neither', () => {
        const controls = attachmentControls({ ...writer, canWrite: false })
        expect(controls.showsAdd).toBe(false)
        expect(controls.showsRemove).toBe(false)
    })

    it('gives a writer on a void document neither', () => {
        const controls = attachmentControls({ ...writer, isVoid: true })
        expect(controls.showsAdd).toBe(false)
        expect(controls.showsRemove).toBe(false)
    })

    it('keeps add drawn but disabled, and Remove disabled, while writes are unavailable', () => {
        const controls = attachmentControls({ ...writer, isDisabled: true })
        expect(controls).toMatchObject({ showsAdd: true, isAddDisabled: true })
        expect(controls).toMatchObject({ isRemoveDisabled: true })
    })

    it('disables add while the attachments load', () => {
        const controls = attachmentControls({ ...writer, isLoading: true })
        expect(controls).toMatchObject({ showsAdd: true, isAddDisabled: true })
    })
})

// One query reads every row of the document and of the one it replaces; the hook splits
// them (plan Phase 4 "One attachment query per document").
describe('splitAttachmentRows', () => {
    // Oldest first, as the query orders them: the replaced bill's two rows, then this
    // bill's three section rows and its W-9 custom File field row.
    const ordered = [
        fixtureRow(ATTACHMENT_IDS.summitPdf),
        fixtureRow(ATTACHMENT_IDS.summitSheet),
        fixtureRow(ATTACHMENT_IDS.billPdf),
        fixtureRow(ATTACHMENT_IDS.billPhoto),
        fixtureRow(ATTACHMENT_IDS.billLong),
        fixtureRow(ATTACHMENT_IDS.billCustomField),
    ]

    it('counts a custom File field row but lists it in neither group', () => {
        const split = splitAttachmentRows(ordered, BILL_IDS.posted, BILL_IDS.summit)
        const listed = [...split.rows, ...split.fromRows].map(r => r.id)
        expect(listed).not.toContain(ATTACHMENT_IDS.billCustomField)
        expect(split.allCount).toBe(6)
    })

    it("puts the replaced document's section rows in fromRows, in created order", () => {
        const split = splitAttachmentRows(ordered, BILL_IDS.posted, BILL_IDS.summit)
        expect(split.fromRows.map(r => r.id)).toEqual([
            ATTACHMENT_IDS.summitPdf,
            ATTACHMENT_IDS.summitSheet,
        ])
    })

    it("keeps this document's section rows in created order", () => {
        const split = splitAttachmentRows(ordered, BILL_IDS.posted, BILL_IDS.summit)
        expect(split.rows.map(r => r.id)).toEqual([
            ATTACHMENT_IDS.billPdf,
            ATTACHMENT_IDS.billPhoto,
            ATTACHMENT_IDS.billLong,
        ])
    })

    // A vendor credit's rows name it in `vendor_credit` (the third parent), and a
    // correction's group reads its original's rows the same way.
    it("splits a vendor credit's rows and its original's by the vendor_credit column", () => {
        const onCredit = (id: string, credit: string) => ({
            ...fixtureRow(id),
            bill: '',
            expense: '',
            vendor_credit: credit,
        })
        const credit = 'vcrd1002ironc01'
        const original = 'vcrd1001pacpw01'
        const rows = [
            onCredit(ATTACHMENT_IDS.summitPdf, original),
            onCredit(ATTACHMENT_IDS.billPdf, credit),
            onCredit(ATTACHMENT_IDS.billCustomField, credit),
        ]
        const split = splitAttachmentRows(rows, credit, original)
        expect(split.rows.map(r => r.id)).toEqual([ATTACHMENT_IDS.billPdf])
        expect(split.fromRows.map(r => r.id)).toEqual([ATTACHMENT_IDS.summitPdf])
        expect(split.allCount).toBe(3)
    })
})

// The server and the client say the same words (plan Decisions "Messages"). `%s` is the
// file name in the Go format strings.
describe('server/attachments.go texts', () => {
    const serverSource = readFileSync(join(__dirname, '..', 'server', 'attachments.go'), 'utf8')

    function goConst(name: string) {
        const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(serverSource)
        if (!match) throw new Error(`no ${name} in server/attachments.go`)
        return match[1]
    }

    it.each([
        [
            'msgAttachmentTooLarge',
            () =>
                attachmentIssue(
                    { name: '%s', type: 'application/pdf', size: MAX_ATTACHMENT_BYTES + 1 },
                    BILL_KIND,
                    0
                ),
        ],
        [
            'msgAttachmentType',
            () => attachmentIssue({ name: '%s', type: 'text/html', size: 1 }, BILL_KIND, 0),
        ],
        ['msgAttachmentBillLimit', () => attachmentIssue(PDF, BILL_KIND, 25)],
        ['msgAttachmentExpenseLimit', () => attachmentIssue(PDF, EXPENSE_KIND, 25)],
        ['msgAttachmentVCLimit', () => attachmentIssue(PDF, VENDOR_CREDIT_KIND, 25)],
    ])('%s says what the client says', (name, clientText) => {
        expect(clientText()).toBe(goConst(name))
    })
})
