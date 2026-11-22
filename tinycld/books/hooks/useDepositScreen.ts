import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo, useRef } from 'react'
import { accountsWithBalances } from '../lib/accounts-query'
import { type DepositScreenState, depositScreenState } from '../lib/deposit-screen-state'
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

// Posting a correction voids its original in the same transaction, and realtime can bring
// the void before the post's answer: while this form's own save corrects the original (the
// save store's `correcting`), the form keeps its place, so it moves on to the posted
// correction or shows a refusal. A void or correction by anyone else shows "cannot be
// edited" (usePaymentScreen's useCorrectionFormKept).
function useCorrectionFormKept(state: DepositScreenState, original: string): DepositScreenState {
    const isOwnSave = useDepositSaveStore(s => original !== '' && s.correcting === original)
    return state === 'cannot-edit' && isOwnSave ? 'form' : state
}

/**
 * Every read of the deposit screen (bank deposit spec §3.9): access, settings, the chart
 * with balances, the deposit at `id` with its items and lines, and the original a
 * correction edits: `?replaces` of a new form, or the `replaces` of a stored correction
 * draft (a correction whose post was refused after its draft was written). Returns which
 * surface to show (depositScreenState), the correction's `replaces` ('' for none) and one
 * Retry over every failed read (merged recoveries). `id` is null at `books/deposits/new`.
 * While the save store holds a deposit (`holding !== null`), a post's optimistic status
 * keeps the form.
 */
export function useDepositScreen(id: string | null, replaces?: string) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const chart = useDepositChart()
    const record = useDepositRecord(id ?? '')
    const isHeld = useDepositSaveStore(s => s.holding !== null)
    const deposit = useHeldDeposit(record.deposit, isHeld)
    const isDraftForm = deposit?.status === 'draft' || isHeld
    const draftReplaces = isDraftForm ? (deposit?.replaces ?? '') : ''
    // An empty `?replaces` is a correction too, so it never falls back to a blank form
    // that could post a second deposit beside the original: it reads no row and so
    // "cannot be edited".
    const formReplaces = id === null ? replaces : draftReplaces || undefined
    const original = useDepositRecord(formReplaces ?? '')
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
    const screenState = depositScreenState({
        isReady,
        isError,
        canWrite: access.canWrite,
        isNew: id === null,
        status: deposit?.status ?? null,
        isHeld,
        replacesStatus: formReplaces === undefined ? undefined : (original.deposit?.status ?? null),
        replacesReady: original.isReady,
        replacesError: original.isError,
    })
    const state = useCorrectionFormKept(screenState, formReplaces ?? '')
    const originalDeposit = original.deposit
    const correction =
        originalDeposit === null
            ? null
            : { deposit: originalDeposit, items: original.items, lines: original.lines }
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.deposit', err),
        })
    }
    return {
        state,
        record: { ...record, deposit },
        // The correction's `replaces` ('' for a new deposit or a plain draft) and its
        // original, read while the form shows.
        replaces: formReplaces ?? '',
        original: correction,
        accounts: chart.rows,
        balanceOf: chart.balanceOf,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        retry,
    }
}
