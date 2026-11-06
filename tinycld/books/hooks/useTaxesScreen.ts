import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { materialize } from 'pbtsdb'
import { TAXES_LOAD_ERROR } from '../lib/tax-messages'
import { taxOptionRows, taxRateOptions } from '../lib/tax-rate-options'
import { buildTaxesView, taxesControls } from '../lib/taxes-view'
import { type TaxDialog, useTaxesStore } from '../stores/taxes-store'
import { useBooksAccess } from './useBooksAccess'
import { type TaxActions, useTaxActions } from './useTaxActions'

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

// A refusal shows in the delete dialog of the record it is about while that dialog is
// open, and in the page's banner otherwise.
function bannerMessageOf(
    state: ReturnType<typeof screenState>,
    refusal: TaxActions['refusal'],
    dialog: TaxDialog | null
) {
    if (state === 'error') return TAXES_LOAD_ERROR
    if (!refusal) return null
    if (dialog?.kind === 'delete' && dialog.id === refusal.id) return null
    return refusal.message
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
    const dialog = useTaxesStore(s => s.dialog)
    const actions = useTaxActions()

    const agencies: AgencyWithRates[] = agenciesQuery.data ?? []
    const groups: GroupRow[] = groupsQuery.data ?? []
    const view = buildTaxesView({
        agencies,
        groups,
        showInactive,
        pendingDefaultId: actions.pendingDefaultId,
    })
    const state = screenState([agenciesQuery, groupsQuery, access])
    const defaultOptions = taxRateOptions(
        taxOptionRows(agencies, groups),
        agencies,
        view.defaultRow?.id ?? ''
    )

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
        actions,
        defaultOptions,
        bannerMessage: bannerMessageOf(state, actions.refusal, dialog),
        dismissBanner: () => actions.clearRefusal(),
    }
}
