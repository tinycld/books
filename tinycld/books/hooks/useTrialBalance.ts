import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useMemo } from 'react'
import { fiscalStartMonth } from '../lib/register-range'
import type { ReportOptions, ReportResult } from '../lib/report-definition'
import {
    buildTrialBalance,
    type TrialBalancePlan,
    trialBalancePlan,
    trialBalanceQuery,
} from '../lib/reports/trial-balance-rows'
import { useBooksSettings } from './useBooksSettings'

export function useTrialBalanceRows(plan: TrialBalancePlan | null) {
    const [accounts, balances, lines] = useStore(
        'books_accounts',
        'books_account_balances',
        'books_journal_lines'
    )
    const result = useLiveQuery({
        query: query =>
            plan ? trialBalanceQuery({ accounts, balances, lines }, plan)(query) : undefined,
        queryKey: [
            'books.report.trial-balance',
            plan?.through,
            plan?.priorThrough,
            plan?.edge?.from,
            plan?.edge?.to,
        ],
    })
    // Only the collections this query reads: lines only when the plan has an edge.
    const sources = plan?.edge ? [accounts, balances, lines] : [accounts, balances]
    return { ...result, sources }
}

export type TrialBalanceSourceRow = NonNullable<
    ReturnType<typeof useTrialBalanceRows>['data']
>[number]

export function useTrialBalance(options: ReportOptions | null): ReportResult {
    const { settings, isReady: isSettingsReady } = useBooksSettings()
    const date = options?.period.to
    const month = fiscalStartMonth(settings)
    const plan = useMemo(
        () => (date !== undefined && isSettingsReady ? trialBalancePlan(date, month) : null),
        [date, month, isSettingsReady]
    )
    const result = useTrialBalanceRows(plan)
    const state = result.isError ? 'error' : plan && result.isReady ? 'ready' : 'loading'

    const data = result.data
    const rowsChoice = options?.rows
    const filter = options?.filters.account
    const model = useMemo(() => {
        if (state !== 'ready' || rowsChoice === undefined || data === undefined) return undefined
        return buildTrialBalance({ rows: data, rowsChoice, filter })
    }, [state, data, rowsChoice, filter])

    const recovery = result.isError
        ? { queries: [result.collection], sources: result.sources }
        : { queries: [], sources: [] }
    const retry = () => {
        void recoverLiveQueries({
            queries: [result.collection],
            sources: result.sources,
            onError: err => log.error('books.report', err),
        })
    }

    return { state, model, recovery, retry }
}
