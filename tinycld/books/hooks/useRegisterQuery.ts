import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useRecord } from '@tinycld/core/lib/use-record'
import { useMemo } from 'react'
import {
    anyActivityQuery,
    openingTotalsQuery,
    registerLinesQuery,
    reversalOriginsQuery,
    subAccountQuery,
} from '../lib/register-query'
import { fiscalStartMonth, type RegisterRange } from '../lib/register-range'
import type { BooksAccounts } from '../types'

export type RegisterAccount = BooksAccounts

// A function receives the fiscal year start month, so the range waits for the settings query this hook runs.
export type RegisterRangeInput =
    | RegisterRange
    | null
    | ((fiscalYearStartMonth: number) => RegisterRange)

function resolveRange(input: RegisterRangeInput, month: number, isSettingsReady: boolean) {
    if (typeof input !== 'function') return input
    return isSettingsReady ? input(month) : null
}

export function useRegisterQuery(accountId: string, rangeInput: RegisterRangeInput) {
    const [accountsCollection, linesCollection, entriesCollection, balancesCollection] = useStore(
        'books_accounts',
        'books_journal_lines',
        'books_journal_entries',
        'books_account_balances'
    )
    const [settingsCollection] = useStore('books_settings')
    const settingsQuery = useLiveQuery({
        query: query => query.from({ settings: settingsCollection }),
        queryKey: ['books.register.settings'],
    })
    const fiscalMonth = fiscalStartMonth(settingsQuery.data?.[0])
    const range = resolveRange(rangeInput, fiscalMonth, settingsQuery.isReady)
    const { record: account, isLoading: isAccountLoading } = useRecord(
        accountsCollection,
        accountId
    )
    const linesQuery = useLiveQuery({
        query: query =>
            range
                ? registerLinesQuery(linesCollection, entriesCollection, accountId, range)(query)
                : undefined,
        queryKey: ['books.register.lines', accountId, range?.start, range?.end],
    })
    const openingQuery = useLiveQuery({
        query: query =>
            range ? openingTotalsQuery(balancesCollection, accountId, range)(query) : undefined,
        queryKey: ['books.register.opening', accountId, range?.start],
    })
    const subAccountResult = useLiveQuery({
        query: query => (range ? subAccountQuery(accountsCollection, accountId)(query) : undefined),
        queryKey: ['books.register.sub-account', accountId, range === null],
    })
    const activityQuery = useLiveQuery({
        query: query =>
            range ? anyActivityQuery(balancesCollection, accountId)(query) : undefined,
        queryKey: ['books.register.activity', accountId, range === null],
    })

    const originIds = [
        ...new Set((linesQuery.data ?? []).map(line => line.entryRecord?.reverses ?? '')),
    ]
        .filter(id => id !== '')
        .sort()
    const originsQuery = useLiveQuery({
        query: query =>
            originIds.length > 0
                ? reversalOriginsQuery(entriesCollection, originIds)(query)
                : undefined,
        queryKey: ['books.register.origins', ...originIds],
    })

    const originRows = originsQuery.data
    const lineRows = linesQuery.data
    const lines = useMemo(() => {
        const originNumbers = new Map((originRows ?? []).map(o => [o.id, o.number]))
        return (lineRows ?? []).map(line => ({
            ...line,
            reversesNumber: originNumbers.get(line.entryRecord?.reverses ?? '') ?? '',
        }))
    }, [lineRows, originRows])
    const opening = openingQuery.data?.[0]
    const priorTotals = {
        debit: opening?.debit_total ?? 0,
        credit: opening?.credit_total ?? 0,
    }

    const retry = () => {
        void recoverLiveQueries({
            queries: [
                settingsQuery,
                linesQuery,
                openingQuery,
                subAccountResult,
                activityQuery,
                originsQuery,
            ].map(q => q.collection),
            sources: [
                settingsCollection,
                accountsCollection,
                linesCollection,
                entriesCollection,
                balancesCollection,
            ],
            onError: err => log.error('books.register', err),
        })
    }

    return {
        range,
        account,
        lines,
        priorTotals,
        hasSubAccounts: (subAccountResult.data?.length ?? 0) > 0,
        hasAnyActivity: (activityQuery.data?.length ?? 0) > 0,
        isReady: range !== null && !isAccountLoading && linesQuery.isReady && openingQuery.isReady,
        isError: [
            linesQuery,
            openingQuery,
            subAccountResult,
            activityQuery,
            settingsQuery,
            originsQuery,
        ].some(q => q.isError),
        retry,
    }
}
