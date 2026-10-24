import { eq, not } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import {
    findOpeningEquityAccount,
    type OpeningAccount,
    type OpeningEntryRow,
    openingScreenState,
    pickOpeningBands,
    type SavedLine,
} from '../lib/opening-balances'
import { fiscalStartMonth } from '../lib/register-range'
import { useBooksAccess } from './useBooksAccess'

// The opening entry is unique among live entries, so two rows would already be
// a bug; the second row lets the state derivation see it.
const ENTRY_LIMIT = 2

export function useOpeningBalancesScreen(isEditing = false) {
    const [accountsCollection, entriesCollection, linesCollection, settingsCollection] = useStore(
        'books_accounts',
        'books_journal_entries',
        'books_journal_lines',
        'books_settings'
    )
    const [usersCollection] = useStore('users')
    const access = useBooksAccess()

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
                .orderBy(({ entry }) => entry.created)
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
    const entries: OpeningEntryRow[] = entriesQuery.data ?? []
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
    const savedAccountIds = new Set(savedLines.map(line => line.account))
    const bands = pickOpeningBands(accounts, savedAccountIds)

    // The books_settings row is created by the module's first migration and its
    // deleteRule is null, so a ready query with no row is a failure, not a default.
    const settingsMissing = access.canRead && settingsQuery.isReady && !settingsRow
    const isError =
        access.isError ||
        settingsMissing ||
        [accountsQuery, entriesQuery, linesQuery, settingsQuery].some(q => q.isError)
    const isReady =
        access.isReady &&
        accountsQuery.isReady &&
        settingsQuery.isReady &&
        entriesQuery.isReady &&
        (entryId === null || linesQuery.isReady)
    const state = openingScreenState({
        isReady,
        isError,
        canRead: access.canRead,
        hasBalanceSheetAccounts: bands.some(band => band.rows.length > 0),
        entries,
        isEditing,
    })
    const canWrite = access.canWrite
    const hasForm = state.kind === 'new' || state.kind === 'draft' || state.kind === 'replace'

    // A query error flips the state to 'error', which sets formKey to null and
    // unmounts the form, so a late error discards what the user typed. Checkpoint 5
    // keeps a mounted form alive over a late error; until then retry remounts it.
    const retry = () => {
        void recoverLiveQueries({
            queries: [
                access.collection,
                accountsQuery.collection,
                entriesQuery.collection,
                linesQuery.collection,
                settingsQuery.collection,
            ],
            // Sources lose their rows until the queries reload them, so only the
            // collections this screen owns the reading of: books_access and users
            // are read app-wide (sidebar, New menu) and stay out.
            sources: [accountsCollection, entriesCollection, linesCollection, settingsCollection],
            onError: err => log.error('books.opening-balances', err),
        })
    }

    return {
        state,
        access,
        canWrite,
        accounts,
        bands,
        equityAccount: findOpeningEquityAccount(accounts),
        settings,
        entry,
        savedLines,
        retry,
        isEditing,
        formKey: hasForm && canWrite ? ('form' as const) : null,
    }
}

export type OpeningScreen = ReturnType<typeof useOpeningBalancesScreen>
