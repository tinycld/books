// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { formHosts } from '@tinycld/core/lib/forms/use-form-hosts'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { deriveFormHosts } from '@tinycld/core/lib/packages/derive-form-hosts'
import * as expoRouter from 'expo-router'
import { createElement, type Provider } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { View } from 'react-native'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    BILL_DOCUMENT,
    type DocumentKind,
    EXPENSE_DOCUMENT,
} from '../tinycld/books/components/documents/document-kinds'
import hosts, { BILL_HOST_KEY, EXPENSE_HOST_KEY } from '../tinycld/books/forms/hosts'
import type {
    DocumentReadLine,
    DocumentRecord,
    DocumentStart,
} from '../tinycld/books/hooks/document-data'
import { useAttachmentFileUpload } from '../tinycld/books/hooks/useAttachmentUpload'
import { useDocumentForm } from '../tinycld/books/hooks/useDocumentForm'
import { useDocumentSave } from '../tinycld/books/hooks/useDocumentSave'
import { BILL_IDS, BILLS } from '../tinycld/books/lib/bill-form-fixture'
import { BILL_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { VENDOR_IDS } from '../tinycld/books/lib/vendor-form-fixture'
import {
    type AttachmentDraft,
    useAttachmentsStore,
} from '../tinycld/books/stores/attachments-store'
import { useDocumentSaveStore } from '../tinycld/books/stores/document-save-store'
import type {
    BooksAttachments,
    BooksBillLines,
    BooksBills,
    BooksExpenseLines,
    BooksExpenses,
} from '../tinycld/books/types'
import {
    enteredWrites,
    guardedStore,
    messageRefusal,
    refuseNthWrite,
    seedBooks,
    seedFormRecords,
} from './accounts-form-harness'
import { silenceLog } from './silence-log'
import {
    liftUploadRefusals,
    pickedFile,
    refuseUpload,
    resetUploads,
    stepUploads,
    uploadCalls,
    uploadRefusal,
} from './upload-stub'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/mutations', async importOriginal => {
    const actual = await importOriginal<typeof import('@tinycld/core/lib/mutations')>()
    const { atomicStub } = await import('./accounts-form-harness')
    return { ...actual, atomic: atomicStub }
})
vi.mock('@tinycld/core/file-viewer/upload-file', async importOriginal => {
    const actual = await importOriginal<typeof import('@tinycld/core/file-viewer/upload-file')>()
    const { uploadRecordWithFileStub } = await import('./upload-stub')
    return { ...actual, uploadRecordWithFile: uploadRecordWithFileStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The attachments step of a bill's and an expense's save (attachments spec §3.2, checkpoint
// 4): Save draft, Post and Post & new upload the session's pending and failed files after
// the document's rows are written and before the post, delete its pending removals, and a
// failed upload leaves the draft saved with the save notice. The collections are the
// harness's real local-only ones, the form and save hooks and the attachments store are the
// real ones; only core's upload request is the shared stub (tests/upload-stub.ts).

type ScreenStubValue = {
    pathname: string
    navigation: { isFocused: () => boolean; dispatch: (action: unknown) => void }
}
const { ScreenStub } = expoRouter as unknown as { ScreenStub: Provider<ScreenStubValue | null> }
const { router } = expoRouter

function hostOf(key: string) {
    const host = hosts.find(h => h.key === key)
    if (!host) throw new Error(`no ${key} host in forms/hosts.ts`)
    return host
}
const billHost = hostOf(BILL_HOST_KEY)
const expenseHost = hostOf(EXPENSE_HOST_KEY)

formHosts.push(
    ...deriveFormHosts([
        {
            manifest: { name: 'Books', slug: 'books' },
            formHosts: [billHost, expenseHost],
            formHostsUi: () => import('../tinycld/books/forms/ui'),
        },
    ])
)

beforeAll(async () => {
    await import('../tinycld/books/forms/ui')
})

const SESSION = 'form:attachments-test'
const EXPENSE_ACCOUNT = 'acct_exp_0001'
const CHECKING = 'acct_bank_0001'
const QUOTA_TEXT =
    'Organization storage limit exceeded: 10.0 GB used of 10.0 GB limit, 0 B available but 60.0 KB requested.'
const BILL_ONE_FAILED =
    'The bill was saved as a draft. 1 attachment did not upload. Save draft or Post tries it again.'
const EXPENSE_TWO_FAILED =
    'The expense was saved as a draft. 2 attachments did not upload. Save draft or Post tries them again.'

const BILL_START: DocumentStart = { kind: 'bill', purchaseLines: 'accounts' }
const EXPENSE_START: DocumentStart = {
    kind: 'expense',
    purchaseLines: 'accounts',
    activePaidFromIds: new Set([CHECKING]),
}

function accountLine(id: string): TableRow {
    return {
        id,
        kind: 'account',
        account: EXPENSE_ACCOUNT,
        description: 'Supplies',
        amount: '125.00',
    }
}

const LINE = accountLine('billattline0001')

let draftCounter = 0

// A file the person picked: pending in the form's session until the save.
function pending(name: string, type: string, size = 1200): AttachmentDraft {
    draftCounter += 1
    return {
        key: `draftkey${String(draftCounter).padStart(7, '0')}`,
        file: pickedFile(name, type, size),
        name,
        mimeType: type,
        size,
        state: { kind: 'pending' },
    }
}

function addPending(...drafts: AttachmentDraft[]) {
    act(() => useAttachmentsStore.getState().add(SESSION, drafts))
}

function session() {
    const found = useAttachmentsStore.getState().sessions[SESSION]
    if (!found) throw new Error('the form session was dropped')
    return found
}

// A file whose upload failed at an earlier save: its row shows the error with Retry.
function failedUpload(name: string, type: string): AttachmentDraft {
    return { ...pending(name, type), state: { kind: 'failed', message: QUOTA_TEXT } }
}

type Form = UseFormReturn<Record<string, unknown>>
type Seen = {
    form: Form
    isReady: boolean
    save: ReturnType<typeof useDocumentSave>
    // The one-file upload a form row's Retry runs (useAttachmentUpload's `uploadNow`).
    storeFile: ReturnType<typeof useAttachmentFileUpload>
}
type ProbeProps = {
    documentKind: DocumentKind
    start: DocumentStart
    record: DocumentRecord | undefined
    lines: DocumentReadLine[]
    seen: { current: Seen | null }
}

// The form as DocumentScreen builds it for a bill or an expense, with its attachments
// session (DocumentScreen passes `form:<formKey>`).
function Probe({ documentKind, start, record, lines, seen }: ProbeProps) {
    const state = useDocumentForm(documentKind, {
        record,
        lines,
        party: undefined,
        currency: 'USD',
        taxRows: [],
        start,
    })
    const save = useDocumentSave(state, { attachmentSession: SESSION })
    const storeFile = useAttachmentFileUpload()
    seen.current = { form: state.form as unknown as Form, isReady: state.isReady, save, storeFile }
    return createElement(View, { ref: save.surfaceRef })
}

type Probe = { current: () => Seen; show: (record: DocumentRecord) => void }

function mount(
    documentKind: DocumentKind,
    start: DocumentStart,
    record: DocumentRecord | undefined,
    lines: DocumentReadLine[],
    pathname: string
): Probe {
    const seen: { current: Seen | null } = { current: null }
    const screen: ScreenStubValue = {
        pathname,
        navigation: { isFocused: () => true, dispatch: () => {} },
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const tree = (shown: DocumentRecord | undefined) =>
        createElement(
            QueryClientProvider,
            { client },
            createElement(
                ScreenStub,
                { value: screen },
                createElement(Probe, { documentKind, start, record: shown, lines, seen })
            )
        )
    const view = render(tree(record))
    return {
        current: () => {
            if (!seen.current) throw new Error('the probe has not rendered')
            return seen.current
        },
        show: shown => view.rerender(tree(shown)),
    }
}

let bills: ReturnType<typeof guardedStore<BooksBills>>
let attachments: ReturnType<typeof guardedStore<BooksAttachments>>

async function openNewBill(): Promise<Probe> {
    const probe = mount(BILL_DOCUMENT, BILL_START, undefined, [], '/a/books/bills/new')
    await waitFor(() => expect(probe.current().isReady).toBe(true))
    act(() => {
        const { form } = probe.current()
        form.setValue('vendor', VENDOR_IDS.officeSupply, { shouldDirty: true })
        form.setValue('account_lines', [LINE], { shouldDirty: true })
    })
    return probe
}

// The stored Pacific Power draft at revision 5, one account line.
const DRAFT_ROW: BooksBills = (() => {
    const row = BILLS.find(bill => bill.id === BILL_IDS.draft)
    if (!row) throw new Error('no draft bill in the fixture')
    return { ...row, revision: 5 }
})()

const DRAFT_LINE: BooksBillLines = {
    id: 'billattdraftln1',
    bill: DRAFT_ROW.id,
    kind: 'account',
    account: EXPENSE_ACCOUNT,
    product: '',
    description: 'Electricity',
    quantity: 0,
    rate: 0,
    amount: 41_286,
    position: 0,
    po_line: '',
    created: DRAFT_ROW.created,
    updated: DRAFT_ROW.updated,
}

function billRecordOf(row: BooksBills): DocumentRecord {
    return {
        ...row,
        customer: '',
        bill_to: null,
        email: '',
        tax_rate: '',
        message: '',
        tax_total: 0,
        kindFields: {
            kind: 'bill',
            vendor: row.vendor,
            terms: row.terms,
            due_date: row.due_date,
            ref_no: row.ref_no,
            mailing_address: row.mailing_address,
            purchase_order: row.purchase_order,
            vendorRow: undefined,
            orderRow: undefined,
            balance: row.balance,
        },
        postedBy: undefined,
        voidedBy: undefined,
        taxRateRow: undefined,
    }
}

const STORED_PDF: BooksAttachments = {
    id: 'attstoredpdf001',
    collectionId: 'books_attachments',
    collectionName: 'books_attachments',
    bill: DRAFT_ROW.id,
    expense: '',
    vendor_credit: '',
    field: '',
    file: 'a_stored.pdf',
    thumbnail: '',
    name: 'a.pdf',
    size: 1200,
    uploaded_by: 'u1',
    created: '2026-11-14 09:00:00.000Z',
    updated: '2026-11-14 09:00:00.000Z',
} as BooksAttachments

// `storedRevision` is the revision the store row holds; the form reads the draft at 5.
async function openStoredBill(storedRevision = DRAFT_ROW.revision): Promise<Probe> {
    bills = guardedStore<BooksBills>('books_bills', [{ ...DRAFT_ROW, revision: storedRevision }])
    guardedStore<BooksBillLines>('books_bill_lines', [DRAFT_LINE])
    attachments = guardedStore<BooksAttachments>('books_attachments', [STORED_PDF])
    const lines: DocumentReadLine[] = [
        { ...DRAFT_LINE, productRow: undefined, accountRow: undefined },
    ]
    const probe = mount(
        BILL_DOCUMENT,
        BILL_START,
        billRecordOf(DRAFT_ROW),
        lines,
        `/a/books/bills/${DRAFT_ROW.id}`
    )
    await waitFor(() => {
        expect(probe.current().isReady).toBe(true)
        expect(probe.current().form.getValues('account_lines')).toHaveLength(1)
    })
    return probe
}

async function settled(probe: Probe) {
    await waitFor(() => expect(probe.current().save.isSaving).toBe(false))
}

function messageAt(form: Form, path: string): string | undefined {
    const error = form.getFieldState(path).error as { message?: unknown } | undefined
    return typeof error?.message === 'string' ? error.message : undefined
}

const rootServer = (probe: Probe) => messageAt(probe.current().form, 'root.server')

function newBillId(): string {
    const [id] = enteredWrites()
    if (!id) throw new Error('nothing was written')
    return id
}

beforeEach(() => {
    seedBooks()
    seedFormRecords([billHost, expenseHost])
    bills = guardedStore<BooksBills>('books_bills', [])
    guardedStore<BooksBillLines>('books_bill_lines', [])
    attachments = guardedStore<BooksAttachments>('books_attachments', [])
    guardedStore<BooksExpenses>('books_expenses', [])
    guardedStore<BooksExpenseLines>('books_expense_lines', [])
    useDocumentSaveStore.setState({ heldId: null })
    useAttachmentsStore.setState({ sessions: {}, holders: {} })
    useAttachmentsStore.getState().open(SESSION)
    resetUploads()
    vi.mocked(router.replace).mockReset()
})

afterEach(() => {
    resetUploads()
})

describe('useDocumentSave attachments step: a new bill', () => {
    it('Post writes the batch, uploads each pending file in list order, then posts at revision 2', async () => {
        const probe = await openNewBill()
        addPending(pending('vendor-bill.pdf', 'application/pdf'), pending('scan.jpg', 'image/jpeg'))
        const uploads = stepUploads()

        await act(async () => {
            void probe.current().save.post(false)
        })

        // The batch (the bill and its line) is written before the first upload starts.
        await waitFor(() => expect(uploadCalls()).toHaveLength(1))
        const id = newBillId()
        expect(enteredWrites()).toEqual([id, LINE.id])
        expect(bills.get(id)?.status).toBe('draft')
        expect(uploadCalls()[0]).toEqual({
            collection: 'books_attachments',
            fields: { bill: id, field: '' },
            fileField: 'file',
            name: 'vendor-bill.pdf',
        })
        // One request at a time: the second file waits for the first.
        await act(async () => {})
        expect(uploadCalls()).toHaveLength(1)

        await act(async () => uploads.next())
        await waitFor(() => expect(uploadCalls()).toHaveLength(2))
        expect(uploadCalls()[1]).toEqual({
            collection: 'books_attachments',
            fields: { bill: id, field: '' },
            fileField: 'file',
            name: 'scan.jpg',
        })
        // No post before the last upload answered.
        expect(enteredWrites()).toEqual([id, LINE.id])

        await act(async () => uploads.next())
        await waitFor(() => expect(enteredWrites()).toEqual([id, LINE.id, id]))
        await settled(probe)
        expect(bills.get(id)?.status).toBe('posted')
        expect(bills.get(id)?.revision).toBe(2)
        expect(session().drafts).toEqual([])
    })

    it('Save draft with upload 2 of 2 refused: the draft stays written with the notice, and the next Save draft uploads only the failed file', async () => {
        const probe = await openNewBill()
        addPending(pending('vendor-bill.pdf', 'application/pdf'), pending('scan.jpg', 'image/jpeg'))
        refuseUpload('scan.jpg', uploadRefusal(QUOTA_TEXT, 413))

        await act(async () => {
            await probe.current().save.saveDraft()
        })
        await settled(probe)

        const id = newBillId()
        // No post: the batch only.
        expect(enteredWrites()).toEqual([id, LINE.id])
        expect(bills.get(id)?.status).toBe('draft')
        await waitFor(() => expect(rootServer(probe)).toBe(BILL_ONE_FAILED))
        // The draft is marked written: the next save updates it.
        expect(probe.current().save.writtenId).toBe(id)
        // The form stays open.
        expect(router.replace).not.toHaveBeenCalled()
        expect(uploadCalls().map(call => call.name)).toEqual(['vendor-bill.pdf', 'scan.jpg'])
        // The stored file left the session; the failed one stays with its error.
        expect(session().drafts.map(d => [d.name, d.state])).toEqual([
            ['scan.jpg', { kind: 'failed', message: QUOTA_TEXT }],
        ])

        liftUploadRefusals()
        await act(async () => {
            await probe.current().save.saveDraft()
        })
        await settled(probe)

        // Only the failed file goes again, to the written draft; no header or line write.
        await waitFor(() => expect(uploadCalls()).toHaveLength(3))
        expect(uploadCalls()[2]).toMatchObject({
            name: 'scan.jpg',
            fields: { bill: id, field: '' },
        })
        expect(enteredWrites()).toEqual([id, LINE.id])
        expect(session().drafts).toEqual([])
        expect(rootServer(probe)).toBeUndefined()
        expect(bills.toArray).toHaveLength(1)
    })

    it('Post & new writes the batch, uploads, posts, then opens the fresh form, and the old session holds nothing', async () => {
        const probe = await openNewBill()
        addPending(pending('vendor-bill.pdf', 'application/pdf'))
        const writesAtNavigation: string[][] = []
        const uploadsAtNavigation: number[] = []
        vi.mocked(router.replace).mockImplementation(() => {
            writesAtNavigation.push(enteredWrites())
            uploadsAtNavigation.push(uploadCalls().length)
        })
        const uploads = stepUploads()

        await act(async () => {
            void probe.current().save.post(true)
        })

        await waitFor(() => expect(uploadCalls()).toHaveLength(1))
        const id = newBillId()
        expect(enteredWrites()).toEqual([id, LINE.id])
        expect(uploadCalls()[0].fields).toEqual({ bill: id, field: '' })
        expect(router.replace).not.toHaveBeenCalled()

        await act(async () => uploads.next())
        await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1))
        await settled(probe)
        // The post came after the upload and before the navigation.
        expect(writesAtNavigation).toEqual([[id, LINE.id, id]])
        expect(uploadsAtNavigation).toEqual([1])
        expect(String(vi.mocked(router.replace).mock.calls[0][0])).toMatch(
            /\/books\/bills\/new\?fresh=[^&]+$/
        )
        expect(bills.get(id)?.status).toBe('posted')
        expect(session().drafts).toEqual([])
        expect(session().removals).toEqual([])
    })
})

describe('useDocumentSave attachments step: a stored draft', () => {
    it('Post with an edited header field and a pending file: the batch without the post, the upload, then the post at sent + 1', async () => {
        const probe = await openStoredBill()
        act(() => {
            probe.current().form.setValue('memo', 'November electricity, both offices', {
                shouldDirty: true,
            })
        })
        addPending(pending('meter.pdf', 'application/pdf'))
        const uploads = stepUploads()

        await act(async () => {
            void probe.current().save.post(false)
        })

        await waitFor(() => expect(uploadCalls()).toHaveLength(1))
        // The batch ran with `post: false`: saved at 6, still a draft.
        expect(enteredWrites()).toEqual([DRAFT_ROW.id])
        expect(bills.get(DRAFT_ROW.id)?.status).toBe('draft')
        expect(bills.get(DRAFT_ROW.id)?.revision).toBe(6)
        expect(bills.get(DRAFT_ROW.id)?.memo).toBe('November electricity, both offices')
        expect(uploadCalls()[0].fields).toEqual({ bill: DRAFT_ROW.id, field: '' })

        await act(async () => uploads.next())
        await waitFor(() => expect(enteredWrites()).toEqual([DRAFT_ROW.id, DRAFT_ROW.id]))
        await settled(probe)
        expect(bills.get(DRAFT_ROW.id)?.status).toBe('posted')
        expect(bills.get(DRAFT_ROW.id)?.revision).toBe(7)
    })

    it('Post with no edited field and a pending file: no batch, the upload, then the post at saw + 1', async () => {
        const probe = await openStoredBill()
        addPending(pending('meter.pdf', 'application/pdf'))
        const uploads = stepUploads()

        await act(async () => {
            void probe.current().save.post(false)
        })

        await waitFor(() => expect(uploadCalls()).toHaveLength(1))
        expect(enteredWrites()).toEqual([])
        expect(bills.get(DRAFT_ROW.id)?.status).toBe('draft')

        await act(async () => uploads.next())
        await waitFor(() => expect(enteredWrites()).toEqual([DRAFT_ROW.id]))
        await settled(probe)
        expect(bills.get(DRAFT_ROW.id)?.status).toBe('posted')
        expect(bills.get(DRAFT_ROW.id)?.revision).toBe(6)
    })

    it('Save draft with only a pending file: no header or line write, one upload, and the save succeeds', async () => {
        const probe = await openStoredBill()
        addPending(pending('meter.pdf', 'application/pdf'))

        await act(async () => {
            await probe.current().save.saveDraft()
        })
        await settled(probe)

        await waitFor(() => expect(uploadCalls()).toHaveLength(1))
        expect(uploadCalls()[0]).toMatchObject({
            name: 'meter.pdf',
            fields: { bill: DRAFT_ROW.id, field: '' },
        })
        expect(enteredWrites()).toEqual([])
        expect(bills.get(DRAFT_ROW.id)?.revision).toBe(DRAFT_ROW.revision)
        await waitFor(() => expect(session().drafts).toEqual([]))
        expect(rootServer(probe)).toBeUndefined()
    })

    it('Save draft with a marked removal: one delete, no upload, and the mark is cleared', async () => {
        const probe = await openStoredBill()
        act(() => useAttachmentsStore.getState().markRemoval(SESSION, STORED_PDF.id))

        await act(async () => {
            await probe.current().save.saveDraft()
        })
        await settled(probe)

        await waitFor(() => expect(enteredWrites()).toEqual([STORED_PDF.id]))
        expect(attachments.get(STORED_PDF.id)).toBeUndefined()
        expect(uploadCalls()).toEqual([])
        expect(session().removals).toEqual([])
        expect(bills.get(DRAFT_ROW.id)?.revision).toBe(DRAFT_ROW.revision)
    })

    it('a stale-revision refusal uploads nothing and keeps the pending files for the next save', async () => {
        // Another session's save reached the store (6) after this form read the draft (5).
        const probe = await openStoredBill(6)
        const file = pending('meter.pdf', 'application/pdf')
        addPending(file)
        const before = session().drafts

        await act(async () => {
            await probe.current().save.saveDraft()
        })
        await settled(probe)

        await waitFor(() => expect(probe.current().save.isConflict).toBe(true))
        expect(uploadCalls()).toEqual([])
        expect(enteredWrites()).toEqual([])
        expect(session().drafts).toEqual(before)

        // The form now shows the row at 6: the next save uploads the kept file.
        probe.show(billRecordOf({ ...DRAFT_ROW, revision: 6 }))
        await act(async () => {
            await probe.current().save.saveDraft()
        })
        await settled(probe)
        await waitFor(() => expect(uploadCalls().map(call => call.name)).toEqual(['meter.pdf']))
        expect(session().drafts).toEqual([])
    })
})

// A failed row's Retry in the form of a written document: the one-file upload at once.
function retry(probe: Probe, key: string, parentId: string) {
    const draft = session().drafts.find(d => d.key === key)
    if (!draft) throw new Error(`no draft ${key} in the session`)
    void probe.current().storeFile({ draft, sessionKey: SESSION, kind: BILL_KIND, parentId })
}

describe('useDocumentSave attachments step: work that changes while the step runs', () => {
    it('a file added while Post uploads is not dropped: no post, no navigation, and the notice', async () => {
        const probe = await openNewBill()
        addPending(pending('vendor-bill.pdf', 'application/pdf'))
        const uploads = stepUploads()

        await act(async () => {
            void probe.current().save.post(false)
        })
        await waitFor(() => expect(uploadCalls()).toHaveLength(1))
        const id = newBillId()

        // ⌥A or a drop while the first file uploads: the new file is pending.
        addPending(pending('receipt.jpg', 'image/jpeg'))
        await act(async () => uploads.next())
        uploads.stop()
        await settled(probe)

        // The bill is not posted and the form stays, so the file is not lost with the
        // form's session.
        expect(bills.get(id)?.status).toBe('draft')
        expect(enteredWrites()).toEqual([id, LINE.id])
        expect(router.replace).not.toHaveBeenCalled()
        expect(session().drafts.map(d => [d.name, d.state.kind])).toEqual([
            ['receipt.jpg', 'pending'],
        ])
        await waitFor(() => expect(rootServer(probe)).toBe(BILL_ONE_FAILED))
    })

    it('a Retry started before Post is not uploaded again, and the post waits for it or refuses', async () => {
        const probe = await openStoredBill()
        const meter = failedUpload('meter.pdf', 'application/pdf')
        addPending(meter)
        const uploads = stepUploads()

        // Retry, then ⌘↵ at once: the retried upload is still in flight.
        act(() => retry(probe, meter.key, DRAFT_ROW.id))
        await waitFor(() => expect(uploadCalls()).toHaveLength(1))
        await act(async () => {
            void probe.current().save.post(false)
        })
        await act(async () => {})

        // The bill is not posted while its file's upload has not answered.
        expect(enteredWrites()).toEqual([])
        expect(bills.get(DRAFT_ROW.id)?.status).toBe('draft')
        expect(uploadCalls().map(call => call.name)).toEqual(['meter.pdf'])

        // The retried upload is refused: the bill must not be posted without the file.
        refuseUpload('meter.pdf', uploadRefusal(QUOTA_TEXT, 413))
        await act(async () => uploads.next())
        uploads.stop()
        await settled(probe)

        expect(uploadCalls().map(call => call.name)).toEqual(['meter.pdf'])
        expect(bills.get(DRAFT_ROW.id)?.status).toBe('draft')
        expect(session().drafts.map(d => [d.name, d.state])).toEqual([
            ['meter.pdf', { kind: 'failed', message: QUOTA_TEXT }],
        ])
        await waitFor(() => expect(rootServer(probe)).toBe(BILL_ONE_FAILED))
    })

    it('a Retry pressed while Save draft uploads another file is not uploaded a second time by the step', async () => {
        const probe = await openStoredBill()
        const first = failedUpload('meter.pdf', 'application/pdf')
        const second = failedUpload('scan.jpg', 'image/jpeg')
        addPending(first, second)
        const uploads = stepUploads()

        await act(async () => {
            void probe.current().save.saveDraft()
        })
        await waitFor(() => expect(uploadCalls().map(call => call.name)).toEqual(['meter.pdf']))

        // Retry on the second failed row while the step uploads the first.
        act(() => retry(probe, second.key, DRAFT_ROW.id))
        await waitFor(() =>
            expect(uploadCalls().map(call => call.name)).toEqual(['meter.pdf', 'scan.jpg'])
        )

        await act(async () => uploads.next())
        await act(async () => uploads.next())
        uploads.stop()
        await settled(probe)

        // scan.jpg went up once: by its Retry, not again by the step.
        expect(uploadCalls().map(call => call.name)).toEqual(['meter.pdf', 'scan.jpg'])
        expect(session().drafts).toEqual([])
    })
})

describe('useDocumentSave attachments step: a refused removal', () => {
    const VOID_TEXT = "This bill is void. Its attachments can't change."

    it('Post with a marked removal whose delete is refused: no post, the row shows again with the refusal, and the summary says it', async () => {
        const probe = await openStoredBill()
        act(() => useAttachmentsStore.getState().markRemoval(SESSION, STORED_PDF.id))
        refuseNthWrite(1, messageRefusal(VOID_TEXT))

        await act(async () => {
            await probe.current().save.post(false)
        })
        await settled(probe)

        // The delete was the one write, and it was refused: the bill stays a draft.
        await waitFor(() => expect(enteredWrites()).toEqual([STORED_PDF.id]))
        expect(bills.get(DRAFT_ROW.id)?.status).toBe('draft')
        expect(bills.get(DRAFT_ROW.id)?.revision).toBe(DRAFT_ROW.revision)
        expect(attachments.get(STORED_PDF.id)).toBeDefined()
        expect(router.replace).not.toHaveBeenCalled()
        // The row is no longer marked (it shows again) and carries the server's text.
        expect(session().removals).toEqual([])
        expect(session().removalRefusals).toEqual({ [STORED_PDF.id]: VOID_TEXT })
        // Not the upload notice: no file failed to upload.
        await waitFor(() => expect(rootServer(probe)).toBe(VOID_TEXT))
    })
})

describe('useDocumentSave attachments step: an expense', () => {
    it('two refused uploads give the expense save notice for 2 attachments', async () => {
        const expenses = guardedStore<BooksExpenses>('books_expenses', [])
        guardedStore<BooksExpenseLines>('books_expense_lines', [])
        const probe = mount(EXPENSE_DOCUMENT, EXPENSE_START, undefined, [], '/a/books/expenses/new')
        await waitFor(() => expect(probe.current().isReady).toBe(true))
        const line = accountLine('expattline00001')
        act(() => {
            const { form } = probe.current()
            form.setValue('vendor', VENDOR_IDS.officeSupply, { shouldDirty: true })
            form.setValue('paid_from', CHECKING, { shouldDirty: true })
            form.setValue('payment_method', 'cash', { shouldDirty: true })
            form.setValue('account_lines', [line], { shouldDirty: true })
        })
        addPending(pending('receipt.jpg', 'image/jpeg'), pending('receipt-2.jpg', 'image/jpeg'))
        refuseUpload('receipt.jpg', uploadRefusal(QUOTA_TEXT, 413))
        refuseUpload('receipt-2.jpg', uploadRefusal(QUOTA_TEXT, 413))

        await act(async () => {
            await probe.current().save.saveDraft()
        })
        await settled(probe)

        const id = newBillId()
        expect(enteredWrites()).toEqual([id, line.id])
        expect(expenses.get(id)?.status).toBe('draft')
        expect(uploadCalls().map(call => [call.name, call.fields])).toEqual([
            ['receipt.jpg', { expense: id, field: '' }],
            ['receipt-2.jpg', { expense: id, field: '' }],
        ])
        await waitFor(() => expect(rootServer(probe)).toBe(EXPENSE_TWO_FAILED))
        expect(session().drafts.map(d => d.state)).toEqual([
            { kind: 'failed', message: QUOTA_TEXT },
            { kind: 'failed', message: QUOTA_TEXT },
        ])
    })
})
