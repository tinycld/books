import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { materialize } from 'pbtsdb'
import { buildTaxesView, taxesControls } from '../lib/taxes-view'
import { useTaxesStore } from '../stores/taxes-store'
import { useBooksAccess } from './useBooksAccess'

// Each agency with its rates and its liability account. Tens of rows: the whole
// collections load.
function useAgenciesQuery() {
    const [agenciesCollection, ratesCollection, accountsCollection] = useStore(
        'books_tax_agencies',
        'books_tax_rates',
        'books_accounts'
    )
    return useLiveQuery({
        query: q =>
            q.from({ agency: agenciesCollection }).select(({ agency }) => ({
                ...agency,
                rates: materialize(
                    q
                        .from({ rate: ratesCollection })
                        .where(({ rate }) => eq(rate.agency, agency.id))
                        .orderBy(({ rate }) => rate.sort_key)
                ),
                liability: materialize(
                    q
                        .from({ account: accountsCollection })
                        .where(({ account }) => eq(account.id, agency.account))
                        .findOne()
                ),
            })),
        queryKey: ['books.taxes.agencies'],
    })
}

// A group's rates are not materialized: TanStack DB correlates an includes subquery only
// through an eq() of a parent and a child field, never a multi relation's id list. The
// view finds them among the rates the agencies query holds.
function useGroupsQuery() {
    const [ratesCollection] = useStore('books_tax_rates')
    return useLiveQuery({
        query: q =>
            q
                .from({ rate: ratesCollection })
                .where(({ rate }) => eq(rate.type, 'group'))
                .orderBy(({ rate }) => rate.sort_key),
        queryKey: ['books.taxes.groups'],
    })
}

export type AgencyWithRates = NonNullable<ReturnType<typeof useAgenciesQuery>['data']>[number]
export type GroupRow = NonNullable<ReturnType<typeof useGroupsQuery>['data']>[number]

function screenState(parts: readonly { isError: boolean; isReady: boolean }[]) {
    if (parts.some(part => part.isError)) return 'error' as const
    if (parts.some(part => !part.isReady)) return 'loading' as const
    return 'ready' as const
}

export function useTaxesScreen() {
    const [agenciesCollection, ratesCollection, accountsCollection] = useStore(
        'books_tax_agencies',
        'books_tax_rates',
        'books_accounts'
    )
    const agenciesQuery = useAgenciesQuery()
    const groupsQuery = useGroupsQuery()
    const access = useBooksAccess()
    const writes = useWritesAvailable()
    const showInactive = useTaxesStore(s => s.showInactive)

    const agencies: AgencyWithRates[] = agenciesQuery.data ?? []
    const groups: GroupRow[] = groupsQuery.data ?? []
    const view = buildTaxesView({ agencies, groups, showInactive, pendingDefaultId: null })
    const state = screenState([agenciesQuery, groupsQuery, access])

    const retry = () => {
        void recoverLiveQueries({
            queries: [agenciesQuery.collection, groupsQuery.collection],
            sources: [agenciesCollection, ratesCollection, accountsCollection],
            onError: err => log.error('books.taxes', err),
        })
        if (access.isError) access.retry()
    }

    return {
        view,
        state,
        retry,
        access,
        controls: taxesControls(access.canWrite, writes.available),
        agencies,
        groups,
    }
}
