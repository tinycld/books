import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo, useRef } from 'react'
import { accountsWithBalances } from '../lib/accounts-query'
import { depositScreenState } from '../lib/deposit-screen-state'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { transferAccountBalance } from '../lib/transfer'
import { useDepositSaveStore } from '../stores/deposit-save-store'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { type DepositRecordHeader, useDepositRecord } from './useDepositRecord'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// While a save or delete holds the deposit, the last row read stands in for an optimistic
// change (a delete removes the row before the server answers, a post flips its status),
// so the form stays up and a refusal lands on it (usePaymentScreen's useHeldPayment).
function useHeldDeposit(
    deposit: DepositRecordHeader | null,
    isHeld: boolean
): DepositRecordHeader | null {
    const lastRef = useRef<DepositRecordHeader | null>(deposit)
    if (deposit) lastRef.current = deposit
    return isHeld ? (deposit ?? lastRef.current) : deposit
}

// The chart with each account's posted balance: Deposit to's options (bank accounts), the
// balance under it, and the accounts an other funds line may name (the schema's context).
function useDepositChart() {
    const [accountsCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_account_balances'
    )
    const query = useLiveQuery({
        query: accountsWithBalances(accountsCollection, balancesCollection),
        queryKey: ['books.deposit.accounts'],
    })
    const rows = query.data
    const balances = useMemo(
        () => new Map((rows ?? []).map(row => [row.id, transferAccountBalance(row)])),
        [rows]
    )
    const recovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [accountsCollection, balancesCollection] }
        : NO_RECOVERY
    return {
        rows: rows ?? [],
        balanceOf: (id: string) => balances.get(id),
        isReady: query.isReady,
        isError: query.isError,
        recovery,
    }
}

/**
 * Every read of the deposit screen (bank deposit spec §3.9): access, settings, the chart
 * with balances, the deposit at `id` with its items and lines, and the original of
 * `?replaces`. Returns which surface to show (depositScreenState) and one Retry over every
 * failed read (merged recoveries). `id` is null at `books/deposits/new`. While the save
 * store holds a deposit (`holding !== null`), a post's optimistic status keeps the form.
 */
export function useDepositScreen(id: string | null, replaces?: string) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const chart = useDepositChart()
    const record = useDepositRecord(id ?? '')
    const original = useDepositRecord(id === null ? (replaces ?? '') : '')
    const isHeld = useDepositSaveStore(s => s.holding !== null)
    const deposit = useHeldDeposit(record.deposit, isHeld)
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [] }
        : NO_RECOVERY
    const recovery = mergeRecoveries([
        accessRecovery,
        settings.recovery,
        chart.recovery,
        record.recovery,
        original.recovery,
    ])
    const isError =
        access.isError ||
        settings.hasLoadError ||
        chart.isError ||
        record.isError ||
        original.isError
    const isReady =
        access.isReady && settings.isReady && chart.isReady && record.isReady && original.isReady
    const state = depositScreenState({
        isReady,
        isError,
        canWrite: access.canWrite,
        isNew: id === null,
        status: deposit?.status ?? null,
        isHeld,
        replacesStatus: replaces ? (original.deposit?.status ?? null) : undefined,
        replacesReady: original.isReady,
        replacesError: original.isError,
    })
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.deposit', err),
        })
    }
    return {
        state,
        record: { ...record, deposit },
        accounts: chart.rows,
        balanceOf: chart.balanceOf,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        retry,
    }
}
