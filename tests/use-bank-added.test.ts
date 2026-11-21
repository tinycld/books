// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBankAdded } from '../tinycld/books/hooks/useBankAdded'
import { useReviewBatch } from '../tinycld/books/hooks/useReviewBatch'
import { useReviewDrawer } from '../tinycld/books/hooks/useReviewDrawer'
import { ENTRIES } from '../tinycld/books/lib/account-register-fixture'
import { useBankingUIStore } from '../tinycld/books/stores/banking-ui-store'
import type {
    BooksBankCategorizations,
    BooksBankFiles,
    BooksBankImports,
    BooksBankTransactions,
    BooksJournalEntries,
} from '../tinycld/books/types'
import { enteredWrites, guardedStore, messageRefusal, seedBooks } from './accounts-form-harness'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

const ACCOUNT = '1000 Business Checking'
const CHECKING = 'acct_check_1000'
const RENT = 'acct_rent_6100'
const BOOKS_LOCKED = 'The books are locked.'

const TXN: BooksBankTransactions = {
    id: 'banktxn_dropbox',
    connection: 'bankconncheckng',
    file: 'bankfile_oct_01',
    bank_import: 'bankimport_0001',
    line: 3,
    date: '2026-10-27',
    description: 'DROPBOX BUSINESS',
    memo: '',
    amount: -4120,
    fitid: '',
    check_number: '',
    dedupe_hash: '0'.repeat(64),
    status: 'reviewed',
    created: '2026-11-03 10:00:00.000Z',
    updated: '2026-11-18 10:00:00.000Z',
}

const FILE: BooksBankFiles = {
    id: 'bankfile_oct_01',
    connection: 'bankconncheckng',
    file: 'oct_2026_abc.csv',
    name: 'oct-2026.csv',
    format: 'csv',
    size: 100,
    content_hash: '1'.repeat(64),
    status: 'imported',
    uploaded_by: 'u_ana',
    statement_balance: 0,
    statement_date: '',
    created: '2026-11-03 09:00:00.000Z',
    updated: '2026-11-03 10:00:00.000Z',
}

const IMPORT: BooksBankImports = {
    id: 'bankimport_0001',
    file: FILE.id,
    header_row: true,
    date_column: 0,
    date_format: 'MM/DD/YYYY',
    description_column: 1,
    amount_columns: 'one',
    amount_column: 2,
    money_in_column: 0,
    money_out_column: 0,
    amount_sign: 'in_positive',
    lines: [],
    imported: 1,
    duplicates: 0,
    created_by: 'u_ana',
    created: '2026-11-03 10:00:00.000Z',
    updated: '2026-11-03 10:00:00.000Z',
}

const ENTRY: BooksJournalEntries = {
    ...ENTRIES[0],
    id: 'entry_dropbox01',
    number: '1042',
    doc_type: 'journal',
    origin: 'manual',
    document: '',
}

const CATEGORIZATION: BooksBankCategorizations = {
    id: 'cat_dropbox0001',
    bank_transaction: TXN.id,
    kind: 'categorize',
    customer: '',
    vendor: '',
    memo: '',
    lines: [{ account: RENT, amount: 4120, memo: '' }],
    connection: 'bankconncheckng',
    entry: ENTRY.id,
    created_by: 'u_ana',
    created: '2026-11-18 10:00:00.000Z',
    updated: '2026-11-18 10:00:00.000Z',
}

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
}

// The drawer's Added to Books as the page builds it: the page's one batch, the drawer
// model over it, and the section over both.
function useAddedDrawer() {
    const batch = useReviewBatch()
    const shownRowIds = useRef<readonly string[]>([])
    const drawer = useReviewDrawer({ accountLabel: ACCOUNT, canWrite: true, batch, shownRowIds })
    return useBankAdded({ drawer, canWrite: true, batch, connectionAccountId: CHECKING })
}

beforeEach(() => {
    useBankingUIStore.getState().closeAll()
})

describe('useBankAdded', () => {
    it("keeps the drawer open on a refused undo and shows the server's message", async () => {
        seedBooks({
            level: 'bookkeeper',
            bankFiles: [FILE],
            bankImports: [IMPORT],
            bankTransactions: [TXN],
            users: [{ id: 'u_ana', name: 'Ana Ruiz', email: 'ana@example.com' }],
            ledger: { lines: [], entries: [ENTRY], balances: [] },
            refusalFor: { [CATEGORIZATION.id]: messageRefusal(BOOKS_LOCKED) },
        })
        const categorizations = guardedStore<BooksBankCategorizations>(
            'books_bank_categorizations',
            [CATEGORIZATION]
        )
        useBankingUIStore.getState().openTxn(TXN.id)
        const { result } = renderHook(() => useAddedDrawer(), { wrapper })

        await waitFor(() => expect(result.current.view).toBe('added'))
        await waitFor(() => expect(result.current.undo.isDisabled).toBe(false))
        expect(result.current.refusal).toBeNull()

        act(() => result.current.onUndo())

        await waitFor(() => expect(result.current.refusal).toBe(BOOKS_LOCKED))
        expect(enteredWrites()).toEqual([CATEGORIZATION.id])
        expect(useBankingUIStore.getState().matchRefusal).toBe(BOOKS_LOCKED)
        expect(useBankingUIStore.getState().openTxnId).toBe(TXN.id)
        // The refused delete rolls back, so the section still shows the categorization.
        await waitFor(() =>
            expect(categorizations.toArray.map(row => row.id)).toEqual([CATEGORIZATION.id])
        )
        expect(result.current.isUndoing).toBe(false)
        expect(result.current.view).toBe('added')
    })
})
