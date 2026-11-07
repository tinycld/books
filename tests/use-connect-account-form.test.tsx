// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BankConnectionRow } from '../tinycld/books/hooks/useBankConnections'
import {
    useBankDetailsForm,
    useConnectAccountForm,
} from '../tinycld/books/hooks/useConnectAccountForm'
import type { BooksBankConnections } from '../tinycld/books/types'
import {
    bankConnectionsStore,
    enteredWrites,
    messageRefusal,
    refuseAfterNow,
    seedBooks,
    serverRefusal,
} from './accounts-form-harness'
import { publishedRow } from './live-rows'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

silenceLog()

// The harness chart's 1000 account is connected; its 1010 account is not.
const CONNECTED_ACCOUNT = 'acct_bank_0001'
const FREE_ACCOUNT = 'acct_bank_0002'
const CONNECTION_ID = 'bankconncheckng'

const STORED: BooksBankConnections = {
    id: CONNECTION_ID,
    account: CONNECTED_ACCOUNT,
    institution: 'First Community Bank',
    account_mask: '4821',
    created_by: 'u1',
    created: '2026-09-01 15:04:00.000Z',
    updated: '2026-09-01 15:04:00.000Z',
}

const CONNECTION: BankConnectionRow = publishedRow(
    {
        id: CONNECTION_ID,
        account: CONNECTED_ACCOUNT,
        accountName: 'Business Checking',
        accountNumber: '1000',
        accountType: 'bank',
        institution: 'First Community Bank',
        accountMask: '4821',
        debitTotal: 0,
        creditTotal: 0,
        waitingCount: 0,
        lastUploadAt: undefined,
        reviewCount: 0,
    },
    'books.banking.connections'
)

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderConnect() {
    const onConnected = vi.fn()
    const hook = renderHook(
        () => {
            const connect = useConnectAccountForm({ onConnected })
            // Read during render so the hook re-renders when an error is set.
            const errors = connect.form.formState.errors
            return { errors, ...connect }
        },
        { wrapper }
    )
    return { ...hook, onConnected }
}

function renderDetails() {
    const onClose = vi.fn()
    const hook = renderHook(
        () => {
            const details = useBankDetailsForm({ connection: CONNECTION, onClose })
            const errors = details.form.formState.errors
            return { errors, ...details }
        },
        { wrapper }
    )
    return { ...hook, onClose }
}

function storedIds() {
    return bankConnectionsStore().toArray.map(row => row.id)
}

function fillConnect(result: ReturnType<typeof renderConnect>['result']) {
    act(() => {
        result.current.form.setValue('account', FREE_ACCOUNT)
        result.current.form.setValue('institution', 'Harbor Savings Bank')
        result.current.form.setValue('account_mask', '5521')
    })
}

beforeEach(() => {
    seedBooks({ level: 'bookkeeper', bankConnections: [STORED] })
})

describe('useConnectAccountForm', () => {
    it('shows a message-only refusal in the root, rolls the insert back and does not connect', async () => {
        const REFUSAL = '1010 Business Savings is already connected.'
        refuseAfterNow(0, messageRefusal(REFUSAL))
        const { result, onConnected } = renderConnect()
        fillConnect(result)
        act(() => result.current.submit())
        await waitFor(() =>
            expect(result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        )
        expect(enteredWrites()).toHaveLength(1)
        await waitFor(() => expect(storedIds()).toEqual([CONNECTION_ID]))
        expect(onConnected).not.toHaveBeenCalled()
    })

    it('puts a field refusal on its field and leaves the root empty', async () => {
        const MESSAGE = 'Must be in a valid format.'
        refuseAfterNow(0, serverRefusal('account_mask', MESSAGE))
        const { result, onConnected } = renderConnect()
        fillConnect(result)
        act(() => result.current.submit())
        await waitFor(() =>
            expect(result.current.form.getFieldState('account_mask').error?.message).toBe(MESSAGE)
        )
        expect(result.current.form.formState.errors.root).toBeUndefined()
        expect(onConnected).not.toHaveBeenCalled()
    })
})

describe('useBankDetailsForm', () => {
    it('shows a message-only refusal in the root and stays open', async () => {
        const REFUSAL = 'Books cannot change this connection right now.'
        refuseAfterNow(0, messageRefusal(REFUSAL))
        const { result, onClose } = renderDetails()
        act(() => {
            result.current.form.setValue('institution', 'Harbor Savings Bank')
            result.current.form.setValue('account_mask', '9876')
        })
        act(() => result.current.submit())
        await waitFor(() =>
            expect(result.current.form.formState.errors.root?.message).toBe(REFUSAL)
        )
        expect(onClose).not.toHaveBeenCalled()
        await waitFor(() =>
            expect(bankConnectionsStore().get(CONNECTION_ID)?.account_mask).toBe('4821')
        )
    })

    it('starts from the connection and saves the new bank details', async () => {
        const { result, onClose } = renderDetails()
        expect(result.current.form.getValues()).toEqual({
            institution: 'First Community Bank',
            account_mask: '4821',
        })
        act(() => {
            result.current.form.setValue('institution', '  Harbor Savings Bank ')
            result.current.form.setValue('account_mask', '9876')
        })
        act(() => result.current.submit())
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
        const stored = bankConnectionsStore().get(CONNECTION_ID)
        expect(stored?.institution).toBe('Harbor Savings Bank')
        expect(stored?.account_mask).toBe('9876')
        expect(stored?.account).toBe(CONNECTED_ACCOUNT)
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
