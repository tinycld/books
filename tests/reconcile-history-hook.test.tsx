// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReconcileHistory } from '../tinycld/books/hooks/useReconcileHistory'
import { ACCOUNTS } from '../tinycld/books/lib/chart-of-accounts-fixture'
import { RECONCILIATION_SAVINGS_FINISHED } from '../tinycld/books/lib/reconcile-fixture'
import { useReconcileStore } from '../tinycld/books/stores/reconcile-store'
import type { BooksReconciliations } from '../tinycld/books/types'
import {
    arriveFromServer,
    guardedStore,
    heldOnDemandStore,
    onDemandStore,
    seedBooks,
} from './accounts-form-harness'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// The ledger's Design note 27 (plan checkpoint 4, addendum B): once the history has loaded,
// a row that leaves it never sends the body back to 'loading'. When the picked account's
// last row leaves (an undo, here or by realtime), the body goes straight to
// 'empty-filtered', and the filter chip and the empty text keep the label the account had
// while its rows were listed. The accounts read is held from the moment the row leaves, so
// a body that waits for a new account read stays 'loading' and the blink is seen.

const ACCOUNT_ID = 'acct_bank_0001'
const ACCOUNT_LABEL = '1000 Cash and bank'

const FINISHED: BooksReconciliations = {
    ...RECONCILIATION_SAVINGS_FINISHED,
    id: 'rhist0000000001',
    account: ACCOUNT_ID,
    statement_date: '2026-10-31',
    status: 'finished',
}

describe('useReconcileHistory: a row that leaves under the account filter', () => {
    let accounts: ReturnType<typeof heldOnDemandStore<(typeof ACCOUNTS)[number]>>
    let reconciliations: ReturnType<typeof guardedStore<BooksReconciliations>>

    beforeEach(() => {
        seedBooks({ level: 'admin' })
        accounts = heldOnDemandStore('books_accounts', ACCOUNTS)
        reconciliations = guardedStore<BooksReconciliations>('books_reconciliations', [FINISHED])
        onDemandStore('reports', [])
        useReconcileStore.setState({ historyAccount: ACCOUNT_ID, historySort: 'descending' })
    })

    afterEach(() => {
        accounts.release()
        useReconcileStore.getState().resetHistory()
    })

    it('goes straight to empty-filtered, never loading, and keeps the account label', async () => {
        const states: string[] = []
        const { result } = renderHook(() => {
            const model = useReconcileHistory()
            states.push(model.state)
            return model
        })

        await waitFor(() => expect(result.current.state).toBe('rows'))
        expect(result.current.filterLabel).toBe(ACCOUNT_LABEL)

        accounts.hold()
        const before = states.length
        await act(() =>
            arriveFromServer(() => {
                reconciliations.delete(FINISHED.id)
            })
        )

        await waitFor(() => expect(result.current.state).toBe('empty-filtered'))
        expect(states.slice(before)).not.toContain('loading')
        expect(result.current.filterLabel).toBe(ACCOUNT_LABEL)
        expect(result.current.pickedLabel).toBe(ACCOUNT_LABEL)
    })
})
