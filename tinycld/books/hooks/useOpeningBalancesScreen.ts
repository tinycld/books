import { eq, not } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router } from 'expo-router'
import { materialize } from 'pbtsdb'
import { useMemo, useState } from 'react'
import {
    findOpeningEquityAccount,
    type OpeningAccount,
    type OpeningScreenState,
    openingScreenState,
    pickOpeningBands,
    type SavedLine,
    viewEntryHref,
} from '../lib/opening-balances'
import { fiscalStartMonth } from '../lib/register-range'
import { SIDEBAR_ENTRIES } from '../lib/shell-nav'
import { useOpeningPostStore } from '../stores/opening-post-store'
import { useBooksAccess } from './useBooksAccess'

// The opening entry is unique among live entries, so two rows would already be
// a bug; the second row lets the state derivation see it.
const ENTRY_LIMIT = 2

function entryIdOf(state: OpeningScreenState | null) {
    return state && 'entry' in state ? state.entry.id : null
}

// A held draft must also follow its entry's date and memo, or the held copy goes stale.
function entryFieldsOf(state: OpeningScreenState | null) {
    return state && 'entry' in state ? `${state.entry.date}|${state.entry.memo}` : null
}

function isSameShown(a: OpeningScreenState | null, b: OpeningScreenState | null) {
    return (
        a?.kind === b?.kind &&
        entryIdOf(a) === entryIdOf(b) &&
        entryFieldsOf(a) === entryFieldsOf(b)
    )
}

export function useOpeningBalancesScreen(isEditing = false) {
    const [accountsCollection, entriesCollection, linesCollection, settingsCollection] = useStore(
        'books_accounts',
        'books_journal_entries',
        'books_journal_lines',
        'books_settings'
    )
    const [usersCollection] = useStore('users')
    const access = useBooksAccess()
    const orgHref = useOrgHref()

    const accountsQuery = useLiveQuery({
        query: query => query.from({ account: accountsCollection }),
        queryKey: ['books.opening.accounts'],
    })
    const entriesQuery = useLiveQuery({
        query: query =>
            query
                .from({ entry: entriesCollection })
                .where(({ entry }) => eq(entry.origin, 'opening_balance'))
                .where(({ entry }) => not(eq(entry.status, 'void')))
                .orderBy(({ entry }) => entry.created, 'desc')
                .limit(ENTRY_LIMIT)
                .select(({ entry }) => ({
                    id: entry.id,
                    date: entry.date,
                    memo: entry.memo,
                    status: entry.status,
                    number: entry.number,
                    replaces: entry.replaces,
                    postedAt: entry.posted_at,
                    postedBy: materialize(
                        query
                            .from({ user: usersCollection })
                            .where(({ user }) => eq(user.id, entry.posted_by))
                            .findOne()
                    ),
                })),
        queryKey: ['books.opening.entries'],
    })
    const entries = entriesQuery.data ?? []
    // Newest first: while a replacement and its original are both posted (the server
    // voids the original after the replacement's post), the newest is the one to show.
    const entry = entries.find(row => row.status === 'draft') ?? entries[0]
    const entryId = entry?.id ?? null

    const linesQuery = useLiveQuery({
        query: query => {
            if (entryId === null) return undefined
            return query
                .from({ line: linesCollection })
                .where(({ line }) => eq(line.entry, entryId))
                .orderBy(({ line }) => line.position)
                .select(({ line }) => ({
                    id: line.id,
                    account: line.account,
                    debit: line.debit,
                    credit: line.credit,
                    position: line.position,
                }))
        },
        queryKey: ['books.opening.lines', entryId],
    })
    const settingsQuery = useLiveQuery({
        query: query => query.from({ settings: settingsCollection }),
        queryKey: ['books.opening.settings'],
    })

    const accounts: OpeningAccount[] = accountsQuery.data ?? []
    const savedLines: SavedLine[] = linesQuery.data ?? []
    const settingsRow = settingsQuery.data?.[0]
    const settings = settingsRow && {
        closeDate: settingsRow.close_date,
        fiscalStartMonth: fiscalStartMonth(settingsRow),
        currency: settingsRow.currency,
    }
    const accountsData = accountsQuery.data
    const linesData = linesQuery.data
    const bands = useMemo(
        () =>
            pickOpeningBands(
                accountsData ?? [],
                new Set((linesData ?? []).map(line => line.account))
            ),
        [accountsData, linesData]
    )

    // The books_settings row is created by the module's first migration and its
    // deleteRule is null, so a ready query with no row is a failure, not a default.
    const settingsMissing = access.canRead && settingsQuery.isReady && !settingsRow
    const isError =
        access.isError ||
        settingsMissing ||
        [accountsQuery, entriesQuery, linesQuery, settingsQuery].some(q => q.isError)
    const isCoreReady =
        access.isReady && accountsQuery.isReady && settingsQuery.isReady && entriesQuery.isReady
    const isLinesReady = entryId === null || linesQuery.isReady
    const loadedState = openingScreenState({
        isReady: isCoreReady && isLinesReady,
        isError,
        canRead: access.canRead,
        hasBalanceSheetAccounts: bands.some(band => band.rows.length > 0),
        entries,
        isEditing,
    })
    const canWrite = access.canWrite

    const equityAccount = findOpeningEquityAccount(accounts)
    const entryLink = entry ? viewEntryHref(SIDEBAR_ENTRIES, entry.id) : null

    // A form that is already shown outlives any transient loading or error state:
    // saving a new draft makes `entry` appear and re-keys the lines query, and
    // unmounting the form meanwhile would discard its errors and what was typed after
    // the save began. The state the form was last shown under is kept in state that is
    // compared and set during render (React's documented pattern for state derived
    // from the previous render), by kind and entry id so it settles after one pass.
    const [shownState, setShownState] = useState<OpeningScreenState | null>(null)
    // Posting updates the entry's status optimistically, so the store reads `posted`
    // before the server has answered. The form stays up until the post settles, or a
    // refusal would roll the entry back under a form that had already been replaced.
    const isPostPending = useOpeningPostStore(s => s.isPostPending)
    const isTransient = loadedState.kind === 'loading' || loadedState.kind === 'error'
    const isHeld = (isTransient || isPostPending) && shownState !== null
    const state = isHeld ? shownState : loadedState
    const isFormState = state.kind === 'new' || state.kind === 'draft' || state.kind === 'replace'
    const nextShown = isFormState && canWrite ? state : null
    if (!isSameShown(shownState, nextShown)) setShownState(nextShown)
    // Save and Post stay disabled while the held form's data is reloading or failed;
    // the screen shows the late error with Retry above the mounted form.
    const hasLateError = isHeld && loadedState.kind === 'error'
    const isRefreshing = isHeld && loadedState.kind === 'loading'

    // Only a failed query is rebuilt, with its own source. Cleaning a healthy
    // query is not harmless: TanStack DB's hook can keep serving the rows it held
    // before the rebuild (its collection is full, `data` stays empty), and the
    // settings row then reads as missing. books_access and users are read
    // app-wide (sidebar, New menu), so they are never a source here.
    const retry = () => {
        const failed = [
            { collection: access.collection, isFailed: access.isError, source: undefined },
            {
                collection: accountsQuery.collection,
                isFailed: accountsQuery.isError,
                source: accountsCollection,
            },
            {
                collection: entriesQuery.collection,
                isFailed: entriesQuery.isError,
                source: entriesCollection,
            },
            {
                collection: linesQuery.collection,
                isFailed: linesQuery.isError,
                source: linesCollection,
            },
            {
                collection: settingsQuery.collection,
                isFailed: settingsQuery.isError || settingsMissing,
                source: settingsCollection,
            },
        ].filter(item => item.isFailed)
        void recoverLiveQueries({
            queries: failed.map(item => item.collection),
            sources: failed.flatMap(item => (item.source ? [item.source] : [])),
            onError: err => log.error('books.opening-balances', err),
        })
    }

    const edit = () => router.setParams({ edit: '1' })
    const backToPosted = () => router.setParams({ edit: undefined })

    return {
        edit,
        backToPosted,
        state,
        access,
        canWrite,
        accounts,
        bands,
        equityAccount,
        settings,
        entry,
        savedLines,
        postedBy: entry?.postedBy?.name ?? '',
        postedAt: entry?.postedAt ?? '',
        entryHref: entryLink === null ? null : orgHref(entryLink),
        retry,
        hasLateError,
        isRefreshing,
        isEditing,
        formKey: isFormState && canWrite ? ('form' as const) : null,
    }
}

export type OpeningScreen = ReturnType<typeof useOpeningBalancesScreen>
