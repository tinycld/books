// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BankConnectionRow } from '../tinycld/books/hooks/useBankConnections'
import { useDisconnectConnection } from '../tinycld/books/hooks/useDisconnectConnection'
import { BANK_FILES } from '../tinycld/books/lib/bank-connection-fixture'
import type { BooksBankConnections, BooksBankFiles } from '../tinycld/books/types'
import {
    bankConnectionsStore,
    bankFilesStore,
    enteredWrites,
    holdWrites,
    messageRefusal,
    refuseAfterNow,
    seedBooks,
} from './accounts-form-harness'
import { publishedRow } from './live-rows'
import { silenceLog } from './silence-log'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const logSpies = silenceLog()

// The harness chart's 1000 account; the refusal text names it as the server would.
const ACCOUNT = 'acct_bank_0001'
const CONNECTION_ID = 'bankconncheckng'
const REFUSAL = '1000 Business Checking has imported transactions, so it cannot be disconnected.'

const STORED: BooksBankConnections = {
    id: CONNECTION_ID,
    account: ACCOUNT,
    institution: 'First Community Bank',
    account_mask: '4821',
    created_by: 'u1',
    created: '2026-09-01 15:04:00.000Z',
    updated: '2026-09-01 15:04:00.000Z',
}

const FILES: BooksBankFiles[] = BANK_FILES.slice(0, 2).map(file => ({
    ...file,
    connection: CONNECTION_ID,
    status: 'uploaded',
}))
const FILE_IDS = FILES.map(file => file.id)

const CONNECTION: BankConnectionRow = publishedRow(
    {
        id: CONNECTION_ID,
        account: ACCOUNT,
        accountName: 'Business Checking',
        accountNumber: '1000',
        accountType: 'bank',
        institution: 'First Community Bank',
        accountMask: '4821',
        debitTotal: 0,
        creditTotal: 0,
        waitingCount: 2,
        lastUploadAt: FILES[0].created,
    },
    'books.banking.connections'
)

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderDisconnect() {
    const onDone = vi.fn()
    const hook = renderHook(
        () => useDisconnectConnection({ connection: CONNECTION, fileIds: FILE_IDS, onDone }),
        { wrapper }
    )
    return { ...hook, onDone }
}

function connectionIds() {
    return bankConnectionsStore().toArray.map(row => row.id)
}

function fileIds() {
    return bankFilesStore()
        .toArray.map(row => row.id)
        .sort()
}

async function settle() {
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
    })
}

beforeEach(() => {
    seedBooks({ level: 'bookkeeper', bankConnections: [STORED], bankFiles: FILES })
})

describe('useDisconnectConnection', () => {
    it('deletes the connection, evicts its files and calls onDone once', async () => {
        const { result, onDone } = renderDisconnect()
        act(() => result.current.confirm())
        await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
        expect(connectionIds()).toEqual([])
        await waitFor(() => expect(fileIds()).toEqual([]))
        expect(result.current.refusal).toBeNull()
        expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('shows the server refusal, rolls the connection back and keeps the files', async () => {
        refuseAfterNow(0, messageRefusal(REFUSAL))
        const { result, onDone } = renderDisconnect()
        act(() => result.current.confirm())
        await waitFor(() => expect(result.current.refusal).toBe(REFUSAL))
        await waitFor(() => expect(connectionIds()).toEqual([CONNECTION_ID]))
        expect(fileIds()).toEqual([...FILE_IDS].sort())
        expect(onDone).not.toHaveBeenCalled()
        expect(enteredWrites()).toEqual([CONNECTION_ID])
        expect(logSpies.error).toHaveBeenCalled()
    })

    it('is pending while the delete is held and sends no second delete', async () => {
        const release = holdWrites()
        const { result, onDone } = renderDisconnect()
        act(() => result.current.confirm())
        await waitFor(() => expect(result.current.isPending).toBe(true))
        act(() => result.current.confirm())
        await settle()
        expect(enteredWrites()).toEqual([CONNECTION_ID])
        // An unguarded second confirm would fail at once (the optimistic delete already took
        // the row) and show that failure as a refusal; the guard sends nothing at all.
        expect(result.current.refusal).toBeNull()
        release()
        await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
        expect(enteredWrites()).toEqual([CONNECTION_ID])
        expect(result.current.isPending).toBe(false)
        expect(result.current.refusal).toBeNull()
        expect(logSpies.error).not.toHaveBeenCalled()
    })
})
