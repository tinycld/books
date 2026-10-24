// Shared setup for the account form and panel tests. The mocked
// `@tinycld/core/lib/pocketbase` module in each test file serves `useStore`
// from this registry, so every hook and component under test is the real one
// and reads and writes real TanStack DB local-only collections.
import { BasicIndex, createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { ACCOUNTS, BALANCES } from '../tinycld/books/lib/chart-of-accounts-fixture'
import type {
    BooksAccess,
    BooksAccountBalances,
    BooksAccounts,
    BooksJournalEntries,
    BooksJournalLines,
    BooksSettings,
} from '../tinycld/books/types'

export const ME = 'u1'

type Level = 'read_only' | 'bookkeeper' | 'admin'

const state = {
    registry: {} as Record<string, unknown>,
    refusal: null as unknown,
    gate: null as Promise<void> | null,
    // Refuses only the writes that touch these account ids.
    refusalFor: {} as Record<string, unknown>,
    // Ids of every account write that reached the server handler, in order.
    entered: [] as string[],
    // Refuses every write after the first `after` ones that reached the handler.
    refuseAfter: null as { after: number; error: unknown } | null,
    // Names passed to useStore, in order, so a test can see which collections a hook reads.
    requested: [] as string[],
}

export function requestedStores() {
    return [...state.requested]
}

export function enteredWrites() {
    return [...state.entered]
}

// Holds every accounts write open until the returned function is called, so a
// test can look at the panel and the hook while a save is still in flight.
export function holdWrites() {
    let release = () => {}
    state.gate = new Promise<void>(resolve => {
        release = resolve
    })
    return () => release()
}

// Stops refusing writes without replacing the stores, so rows written so far stay.
export function liftRefusal() {
    state.refusal = null
    state.refuseAfter = null
    state.refusalFor = {}
}

export function useStoreStub(...names: string[]) {
    state.requested.push(...names)
    return names.map(name => state.registry[name])
}

let counter = 0
const indexed = { autoIndex: 'eager' as const, defaultIndexType: BasicIndex }

function local<T extends { id: string }>(name: string, initialData: T[]) {
    counter += 1
    return createCollection(
        localOnlyCollectionOptions({
            id: `${name}-${counter}`,
            getKey: (row: T) => row.id,
            initialData,
            ...indexed,
        })
    )
}

// The accounts collection can be told to refuse a write with the error shape
// PocketBase rejects with, so a test can see how a server refusal is handled.
// Passing the handlers to the local-only options (not wrapping them afterwards)
// is what makes a write go through them instead of completing at once.
function accountsCollection() {
    counter += 1
    const refuseWhenAsked = async ({
        transaction,
    }: {
        transaction: { mutations: ReadonlyArray<{ key: unknown }> }
    }) => {
        const keys = transaction.mutations.map(m => String(m.key))
        state.entered.push(...keys)
        if (state.gate) await state.gate
        if (state.refuseAfter && state.entered.length > state.refuseAfter.after) {
            throw state.refuseAfter.error
        }
        const refusedKey = keys.find(key => key in state.refusalFor)
        if (refusedKey !== undefined) throw state.refusalFor[refusedKey]
        if (state.refusal) throw state.refusal
    }
    return createCollection(
        localOnlyCollectionOptions({
            id: `books_accounts-${counter}`,
            getKey: (row: BooksAccounts) => row.id,
            initialData: ACCOUNTS,
            onInsert: refuseWhenAsked,
            onUpdate: refuseWhenAsked,
            onDelete: refuseWhenAsked,
            ...indexed,
        })
    )
}

function neverReady<T extends { id: string }>() {
    counter += 1
    return createCollection({
        id: `never-ready-${counter}`,
        getKey: (row: T) => row.id,
        sync: { sync: () => {} },
    })
}

function erroredCollection<T extends { id: string }>() {
    counter += 1
    return createCollection({
        id: `errored-${counter}`,
        getKey: (row: T) => row.id,
        sync: {
            // Fails after the subscription is set up, as a failed fetch would.
            sync: ({ collection }) => {
                queueMicrotask(() => collection._lifecycle.markError(new Error('load failed')))
            },
        },
    })
}

function journalLine(account: string, position: number): BooksJournalLines {
    return {
        id: `line_${account}_${position}`,
        entry: 'entry_1',
        account,
        debit: 100,
        credit: 0,
        memo: '',
        position,
        posted: true,
        date: '2026-09-01',
        currency: 'USD',
        created: '2026-01-01 00:00:00.000Z',
        updated: '2026-01-01 00:00:00.000Z',
    }
}

function accountsCollectionFor(opts: { accountsNeverReady?: boolean; accountsErrored?: boolean }) {
    if (opts.accountsErrored) return erroredCollection<BooksAccounts>()
    if (opts.accountsNeverReady) return neverReady<BooksAccounts>()
    return accountsCollection()
}

export function seedBooks(
    opts: {
        level?: Level
        linesOn?: Record<string, number>
        refusal?: unknown
        // Refuses only the writes on these account ids, by id.
        refusalFor?: Record<string, unknown>
        // Lets the first `after` writes through and refuses each later one.
        refuseAfter?: { after: number; error: unknown }
        // A journal-lines collection that never finishes loading, so the usage
        // query stays not ready.
        linesNeverReady?: boolean
        // An accounts collection that never finishes loading, so the accounts
        // query stays not ready.
        accountsNeverReady?: boolean
        // An accounts collection whose sync fails, so the accounts query errors.
        accountsErrored?: boolean
        // A balances collection that never finishes loading.
        balancesNeverReady?: boolean
        // Replaces the journal lines, entries, balances and settings rows, for the register tests.
        ledger?: {
            lines: BooksJournalLines[]
            entries: BooksJournalEntries[]
            balances: BooksAccountBalances[]
            settings?: BooksSettings[]
        }
    } = {}
) {
    const level = opts.level ?? 'bookkeeper'
    const lines = Object.entries(opts.linesOn ?? {}).flatMap(([account, count]) =>
        Array.from({ length: count }, (_, i) => journalLine(account, i))
    )
    const access: BooksAccess = {
        id: 'access_1',
        user: ME,
        level,
        can_read: true,
        can_write: level !== 'read_only',
        is_admin: level === 'admin',
    }
    state.refusal = opts.refusal ?? null
    state.refusalFor = opts.refusalFor ?? {}
    state.refuseAfter = opts.refuseAfter ?? null
    state.entered = []
    state.requested = []
    state.gate = null
    state.registry = {
        books_accounts: accountsCollectionFor(opts),
        books_account_balances: opts.balancesNeverReady
            ? neverReady<BooksAccountBalances>()
            : local<BooksAccountBalances>(
                  'books_account_balances',
                  opts.ledger?.balances ?? BALANCES
              ),
        books_journal_lines: opts.linesNeverReady
            ? neverReady<BooksJournalLines>()
            : local<BooksJournalLines>('books_journal_lines', opts.ledger?.lines ?? lines),
        books_journal_entries: local<BooksJournalEntries>(
            'books_journal_entries',
            opts.ledger?.entries ?? []
        ),
        books_settings: local<BooksSettings>('books_settings', opts.ledger?.settings ?? []),
        books_access: local<BooksAccess>('books_access', [access]),
    }
}

export function accountsStore() {
    return state.registry.books_accounts as ReturnType<typeof accountsCollection>
}

// Seeded collections a register test writes to after the first render.
export function lineStore() {
    return state.registry.books_journal_lines as ReturnType<typeof local<BooksJournalLines>>
}

export function entryStore() {
    return state.registry.books_journal_entries as ReturnType<typeof local<BooksJournalEntries>>
}

export function balanceStore() {
    return state.registry.books_account_balances as ReturnType<typeof local<BooksAccountBalances>>
}

export function settingsStore() {
    return state.registry.books_settings as ReturnType<typeof local<BooksSettings>>
}

export function storedAccounts(): BooksAccounts[] {
    return accountsStore().toArray
}

// Shaped like the PocketBase SDK's ClientResponseError: an Error whose
// `response.data` maps field names to messages. TanStack DB re-wraps anything
// that is not an Error, so a plain object would lose the field map.
export function serverRefusal(field: string, message: string) {
    return Object.assign(new Error(message), { response: { data: { [field]: { message } } } })
}

// Shaped like the refusal the real server sends for a rule that belongs to no
// field (a depth or inactive-parent rule): a message and an empty data map.
export function messageRefusal(message: string) {
    return Object.assign(new Error(message), {
        status: 400,
        response: { message, data: {} },
    })
}
