// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { describe, expect, it, vi } from 'vitest'
import { useBankTxnDetail } from '../tinycld/books/hooks/useBankTxnDetail'
import type {
    BooksBankFiles,
    BooksBankImports,
    BooksBankTransactions,
} from '../tinycld/books/types'
import { bankTransactionsStore, seedBooks } from './accounts-form-harness'
import { expectLiveQueryError } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ACCOUNT = '1000 Business Checking'

const TXN: BooksBankTransactions = {
    id: 'banktxn_insure1',
    connection: 'bankconncheckng',
    file: 'bankfile_oct_01',
    bank_import: 'bankimport_0001',
    line: 7,
    date: '2026-10-27',
    description: 'INSURANCE PREMIUM',
    memo: 'Policy 88',
    amount: -36240,
    fitid: '',
    check_number: '1050',
    dedupe_hash: '0'.repeat(64),
    status: 'for_review',
    created: '2026-11-03 10:00:00.000Z',
    updated: '2026-11-03 10:00:00.000Z',
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

const FACTS = {
    id: TXN.id,
    status: 'for_review',
    amount: -36240,
    date: '2026-10-27',
    description: 'INSURANCE PREMIUM',
    memo: 'Policy 88',
    checkNumber: '1050',
    accountLabel: ACCOUNT,
    fileName: 'oct-2026.csv',
    line: 7,
    importedAt: '2026-11-03 10:00:00.000Z',
    importerName: 'Ana Ruiz',
}

function seed(opts: { readFailsOnce?: boolean } = {}) {
    seedBooks({
        level: 'bookkeeper',
        bankFiles: [FILE],
        bankImports: [IMPORT],
        bankTransactions: [TXN],
        bankTransactionReadFailsOnceFor: opts.readFailsOnce ? TXN.id : undefined,
        users: [{ id: 'u_ana', name: 'Ana Ruiz', email: 'ana@example.com' }],
    })
}

function renderDetail(txnId: string) {
    return renderHook(() => useBankTxnDetail(txnId, ACCOUNT))
}

describe('useBankTxnDetail', () => {
    it('shows a refused read as an error with no detail, and the retry loads the facts', async () => {
        seed({ readFailsOnce: true })
        expectLiveQueryError(bankTransactionsStore().id)
        const { result } = renderDetail(TXN.id)

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.detail).toBeNull()
        expect(result.current.isLoading).toBe(false)
        // A failed live query does not load again by itself.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })
        expect(result.current.isError).toBe(true)

        // As useReviewTab's Retry runs it.
        await act(async () => {
            await recoverLiveQueries({
                ...result.current.recovery,
                onError: error => {
                    throw error
                },
            })
        })

        await waitFor(() => expect(result.current.detail).toEqual(FACTS))
        expect(result.current.isError).toBe(false)
        expect(result.current.isLoading).toBe(false)
    })

    it('shows a ready read that finds no transaction as an error', async () => {
        seed()
        const { result } = renderDetail('banktxn_gone001')

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.detail).toBeNull()
        expect(result.current.isLoading).toBe(false)
    })
})
