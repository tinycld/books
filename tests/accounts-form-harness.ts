// Shared setup for the account form and panel tests. The mocked
// `@tinycld/core/lib/pocketbase` module in each test file serves `useStore`
// from this registry, so every hook and component under test is the real one
// and reads and writes real TanStack DB local-only collections.
import { BasicIndex, createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import type { OrgPkgAccess } from '@tinycld/core/types/pbSchema'
import { ACCOUNTS, BALANCES } from '../tinycld/books/lib/chart-of-accounts-fixture'
import type {
    BooksAccess,
    BooksAccountBalances,
    BooksAccounts,
    BooksAdmins,
    BooksCloseOverrides,
    BooksDocSequences,
    BooksJournalEntries,
    BooksJournalLines,
    BooksSettings,
} from '../tinycld/books/types'
import { refusedLoad } from './silence-log'

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
    // Refuses every settings write with this error.
    refuseSettings: null as unknown,
    // Refuses every settings write after the first `after` ones that reached the handler.
    refuseSettingsAfter: null as { after: number; error: unknown } | null,
    // Refuses every doc sequence write with this error.
    refuseSequences: null as unknown,
    // Refuses every close override write with this error.
    refuseOverrides: null as unknown,
    // Ids of every close override delete that reached the handler.
    overrideDeletes: [] as string[],
    settingsEntered: 0,
    // Refuses every org_pkg_access or books_admins write after the first `after` ones that reached a handler.
    refuseAccess: null as { after: number; error: unknown } | null,
    accessEntered: 0,
    accessInFlight: 0,
    accessMaxInFlight: 0,
    // Releases the core and admin reads held by holdCoreRead / holdAdminRead.
    releaseReads: [] as (() => void)[],
    // Makes books_access.reload() wait until released.
    reloadGate: null as Promise<void> | null,
    // Makes books_access.reload() reject with this error.
    reloadError: null as unknown,
    // Every write that reached a handler, in order: `account:<id>`, `settings:<id>` or `sequence:<id>`.
    log: [] as string[],
    // Writes waiting for `stepWrites().next()`; null when writes are not stepped.
    steps: null as (() => void)[] | null,
    // Refuses only the write at this position in `entered`, once, so a later write passes.
    refuseAt: [] as { at: number; error: unknown }[],
    // Names passed to useStore, in order, so a test can see which collections a hook reads.
    requested: [] as string[],
}

export function requestedStores() {
    return [...state.requested]
}

export function writeLog() {
    return [...state.log]
}

// Forgets the writes seen so far, so a position given to `refuseAfter` counts
// only the writes a test makes after its own setup (seeding, emptying the chart).
export function resetWriteCounts() {
    state.entered = []
    state.log = []
}

// Lets the next `after` account writes through and refuses each later one. Unlike
// the `refuseAfter` seed option, the count starts now, so it ignores the writes
// a test made while setting up.
// Lets the next `after` settings writes through and refuses each later one, so a
// test can refuse only the closing write.
export function refuseSettingsAfterNow(after: number, error: unknown) {
    state.settingsEntered = 0
    state.refuseSettingsAfter = { after, error }
}

export function refuseAfterNow(after: number, error: unknown) {
    resetWriteCounts()
    state.refuseAfter = { after, error }
}

// Makes every account and settings write wait until `next()` lets exactly one
// continue, so a test can look at the world between any two writes.
export function stepWrites() {
    const waiting: (() => void)[] = []
    state.steps = waiting
    return {
        next: () => waiting.shift()?.(),
        stop: () => {
            state.steps = null
            for (const resume of waiting.splice(0)) resume()
        },
    }
}

async function waitForStep() {
    const steps = state.steps
    if (steps) await new Promise<void>(resume => steps.push(resume))
}

// Most org_pkg_access / books_admins writes that were inside a handler at the same moment.
export function maxAccessWritesInFlight() {
    return state.accessMaxInFlight
}

// Holds books_access.reload() open until the returned function is called.
export function holdReload() {
    let release = () => {}
    state.reloadGate = new Promise<void>(resolve => {
        release = resolve
    })
    return () => release()
}

// Makes books_access.reload() reject with this error until liftRefusal().
export function failReload(error: unknown) {
    state.reloadError = error
}

// Lets the org_pkg_access and books_admins reads that were seeded with holdCoreRead /
// holdAdminRead finish loading, with their seeded rows.
export function releaseAccessReads() {
    for (const release of state.releaseReads.splice(0)) release()
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
    state.refuseAt = []
    state.refusalFor = {}
    state.refuseSettings = null
    state.refuseSettingsAfter = null
    state.refuseSequences = null
    state.refuseOverrides = null
    state.refuseAccess = null
    state.reloadError = null
}

// Starts refusing once `more` further writes have reached the handler, so a test can
// fail a later attempt without replacing the stores.
export function refuseAfterMore(more: number, error: unknown) {
    state.refuseAfter = { after: state.entered.length + more, error }
}

// Refuses only the `nth` further write (1 is the next one) and lets every other write pass, so a
// test can fail one step of a sequence and still see the cleanup write after it succeed.
export function refuseNthWrite(nth: number, error: unknown) {
    state.refuseAt.push({ at: state.entered.length + nth, error })
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

// A write handler that can be told to refuse with the error shape PocketBase
// rejects with, so a test can see how a server refusal is handled. Passing the
// handlers to the local-only options (not wrapping them afterwards) is what makes
// a write go through them instead of completing at once.
async function refuseSharedWrite({
    transaction,
}: {
    transaction: { mutations: ReadonlyArray<{ key: unknown }> }
}) {
    const keys = transaction.mutations.map(m => String(m.key))
    state.entered.push(...keys)
    if (state.gate) await state.gate
    await waitForStep()
    const refusedAt = state.refuseAt.find(refusal => refusal.at === state.entered.length)
    if (refusedAt) throw refusedAt.error
    if (state.refuseAfter && state.entered.length > state.refuseAfter.after) {
        throw state.refuseAfter.error
    }
    const refusedKey = keys.find(key => key in state.refusalFor)
    if (refusedKey !== undefined) throw state.refusalFor[refusedKey]
    if (state.refusal) throw state.refusal
}

function accountsCollection() {
    counter += 1
    const refuseWhenAsked = async (args: Parameters<typeof refuseSharedWrite>[0]) => {
        state.log.push(...args.transaction.mutations.map(m => `account:${String(m.key)}`))
        await refuseSharedWrite(args)
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

// Entries and lines go through the same handler as accounts, so a save test can
// hold, count or refuse their writes. Only a test that asks for a refusal, a
// hold or a count sees a difference.
function guarded<T extends { id: string }>(name: string, initialData: T[]) {
    counter += 1
    return createCollection(
        localOnlyCollectionOptions({
            id: `${name}-${counter}`,
            getKey: (row: T) => row.id,
            initialData,
            onInsert: refuseSharedWrite,
            onUpdate: refuseSharedWrite,
            onDelete: refuseSharedWrite,
            ...indexed,
        })
    )
}

// Like the accounts collection, the settings collection runs its writes through
// handlers so a test can see their order and refuse them.
function settingsCollection(initialData: BooksSettings[]) {
    counter += 1
    const refuseWhenAsked = async ({
        transaction,
    }: {
        transaction: { mutations: ReadonlyArray<{ key: unknown }> }
    }) => {
        state.log.push(...transaction.mutations.map(m => `settings:${String(m.key)}`))
        if (state.gate) await state.gate
        await waitForStep()
        if (state.refuseSettings) throw state.refuseSettings
        state.settingsEntered += 1
        const late = state.refuseSettingsAfter
        if (late && state.settingsEntered > late.after) throw late.error
    }
    return createCollection(
        localOnlyCollectionOptions({
            id: `books_settings-${counter}`,
            getKey: (row: BooksSettings) => row.id,
            initialData,
            onInsert: refuseWhenAsked,
            onUpdate: refuseWhenAsked,
            onDelete: refuseWhenAsked,
            ...indexed,
        })
    )
}

// The doc sequences collection runs its writes through handlers too, logged as
// `sequence:<id>`, so a test can count them and refuse them.
function sequencesCollection(initialData: BooksDocSequences[]) {
    counter += 1
    const refuseWhenAsked = async ({
        transaction,
    }: {
        transaction: { mutations: ReadonlyArray<{ key: unknown }> }
    }) => {
        state.log.push(...transaction.mutations.map(m => `sequence:${String(m.key)}`))
        if (state.gate) await state.gate
        await waitForStep()
        if (state.refuseSequences) throw state.refuseSequences
    }
    return createCollection(
        localOnlyCollectionOptions({
            id: `books_doc_sequences-${counter}`,
            getKey: (row: BooksDocSequences) => row.id,
            initialData,
            onInsert: refuseWhenAsked,
            onUpdate: refuseWhenAsked,
            onDelete: refuseWhenAsked,
            ...indexed,
        })
    )
}

// The close overrides collection logs its writes as `override:<id>` and records
// every delete, so a test can prove an override is never deleted.
function overridesCollection(initialData: BooksCloseOverrides[]) {
    counter += 1
    const refuseWhenAsked = async ({
        transaction,
    }: {
        transaction: { mutations: ReadonlyArray<{ key: unknown; type: string }> }
    }) => {
        state.log.push(...transaction.mutations.map(m => `override:${String(m.key)}`))
        state.overrideDeletes.push(
            ...transaction.mutations.filter(m => m.type === 'delete').map(m => String(m.key))
        )
        if (state.gate) await state.gate
        await waitForStep()
        if (state.refuseOverrides) throw state.refuseOverrides
    }
    return createCollection(
        localOnlyCollectionOptions({
            id: `books_close_overrides-${counter}`,
            getKey: (row: BooksCloseOverrides) => row.id,
            initialData,
            onInsert: refuseWhenAsked,
            onUpdate: refuseWhenAsked,
            onDelete: refuseWhenAsked,
            ...indexed,
        })
    )
}

type AccessMutation = {
    key: unknown
    type: string
    modified: Record<string, unknown>
    changes: Record<string, unknown>
}

async function runAccessWrite(entries: string[]) {
    state.log.push(...entries)
    state.accessInFlight += 1
    state.accessMaxInFlight = Math.max(state.accessMaxInFlight, state.accessInFlight)
    try {
        if (state.gate) await state.gate
        await waitForStep()
        state.accessEntered += 1
        const refuse = state.refuseAccess
        if (refuse && state.accessEntered > refuse.after) throw refuse.error
    } finally {
        state.accessInFlight -= 1
    }
}

// Logged as `core:insert:<user>:<pkg>:<access>` or `core:update:<id>:<access>`.
function describeCoreWrite(m: AccessMutation) {
    if (m.type === 'insert') {
        return `core:insert:${m.modified.user}:${m.modified.pkg}:${m.modified.access}`
    }
    return `core:${m.type}:${String(m.key)}:${m.changes.access ?? m.modified.access}`
}

// Logged as `admin:insert:<user>` or `admin:delete:<id>`.
function describeAdminWrite(m: AccessMutation) {
    return m.type === 'insert'
        ? `admin:insert:${m.modified.user}`
        : `admin:${m.type}:${String(m.key)}`
}

function accessWriteCollection<T extends { id: string }>(
    name: string,
    initialData: T[],
    describe: (m: AccessMutation) => string
) {
    counter += 1
    const handler = async ({ transaction }: { transaction: { mutations: AccessMutation[] } }) =>
        runAccessWrite(transaction.mutations.map(describe))
    return createCollection(
        localOnlyCollectionOptions({
            id: `${name}-${counter}`,
            getKey: (row: T) => row.id,
            initialData,
            onInsert: handler,
            onUpdate: handler,
            onDelete: handler,
            ...indexed,
        })
    )
}

// The real view computes each level from org_pkg_access and books_admins, so a reload after a
// write shows the level those writes produced.
function refreshLevelsFromWrites(collection: ReturnType<typeof local<BooksAccess>>) {
    const core = (state.registry.org_pkg_access as { toArray: OrgPkgAccess[] }).toArray
    const admins = (state.registry.books_admins as { toArray: BooksAdmins[] }).toArray
    for (const row of core.filter(r => r.pkg === 'books')) {
        const isAdmin = admins.some(a => a.user === row.user)
        const level =
            row.access === 'none'
                ? 'none'
                : row.access === 'readonly'
                  ? 'read_only'
                  : isAdmin
                    ? 'admin'
                    : 'bookkeeper'
        const next = {
            id: row.user,
            user: row.user,
            level,
            can_read: level !== 'none',
            can_write: level === 'bookkeeper' || level === 'admin',
            is_admin: level === 'admin',
        } satisfies BooksAccess
        if (collection.has(row.user))
            collection.update(row.user, draft => Object.assign(draft, next))
        else collection.insert(next)
    }
}

// books_access is a view without realtime, so the screen calls reload(); the stub logs
// it as `access:reload` so a test can see it ran after the writes.
function accessViewCollection(rows: BooksAccess[]) {
    const collection = local<BooksAccess>('books_access', rows)
    const reload = async () => {
        state.log.push('access:reload')
        if (state.reloadGate) await state.reloadGate
        if (state.reloadError) throw state.reloadError
        refreshLevelsFromWrites(collection)
    }
    return Object.assign(collection, { reload })
}

// Like accessWriteCollection, but its first load waits for releaseAccessReads(), so a test
// can act while the hook's own read of the row is not ready yet.
function heldAccessCollection<T extends { id: string }>(
    name: string,
    rows: T[],
    describe: (m: AccessMutation) => string
) {
    counter += 1
    // A synced collection drops its optimistic rows once the handler returns, so a write that
    // succeeds must be applied to the synced rows for a later read to see it.
    let applyWrite: ((m: AccessMutation) => void) | null = null
    const handler = async ({ transaction }: { transaction: { mutations: AccessMutation[] } }) => {
        await runAccessWrite(transaction.mutations.map(describe))
        for (const m of transaction.mutations) applyWrite?.(m)
    }
    return createCollection({
        id: `${name}-held-${counter}`,
        getKey: (row: T) => row.id,
        ...indexed,
        onInsert: handler,
        onUpdate: handler,
        onDelete: handler,
        sync: {
            sync: ({ begin, write, commit, markReady }) => {
                applyWrite = m => {
                    begin()
                    write({ type: m.type, value: m.modified as T })
                    commit()
                }
                state.releaseReads.push(() => {
                    begin()
                    for (const value of rows) write({ type: 'insert', value })
                    commit()
                    markReady()
                })
            },
        },
    })
}

function accessReadCollection<T extends { id: string }>(
    name: string,
    rows: T[],
    describe: (m: AccessMutation) => string,
    mode: { held?: boolean; neverReady?: boolean; errored?: boolean }
) {
    if (mode.errored) return erroredCollection<T>()
    if (mode.neverReady) return neverReady<T>()
    if (mode.held) return heldAccessCollection<T>(name, rows, describe)
    return accessWriteCollection<T>(name, rows, describe)
}

export interface SeedUser {
    id: string
    name: string
    email: string
    role?: 'owner' | 'admin' | 'member' | 'guest'
}

function neverReady<T extends { id: string }>() {
    counter += 1
    return createCollection({
        id: `never-ready-${counter}`,
        getKey: (row: T) => row.id,
        ...indexed,
        sync: { sync: () => {} },
    })
}

function erroredCollection<T extends { id: string }>() {
    counter += 1
    return createCollection({
        id: `errored-${counter}`,
        getKey: (row: T) => row.id,
        ...indexed,
        sync: {
            // Fails after the subscription is set up, as a failed fetch would.
            sync: ({ collection }) => {
                queueMicrotask(() => collection._lifecycle.markError(new Error('load failed')))
            },
        },
    })
}

// Fails the way a pbtsdb on-demand collection does when a fetch is refused: the
// source is ready at once, and only the first subset load rejects with a 4xx that
// pbtsdb does not retry. That fails the one live query that asked for it while the
// source and its other readers stay healthy. Later loads serve `rows`, so a retry
// that rebuilds the failed query recovers it.
function failsOnceOnDemandCollection<T extends { id: string }>(rows: T[]) {
    counter += 1
    const id = `fails-once-on-demand-${counter}`
    let loads = 0
    return createCollection({
        id,
        getKey: (row: T) => row.id,
        ...indexed,
        syncMode: 'on-demand',
        sync: {
            sync: ({ begin, write, commit, markReady }) => {
                markReady()
                return {
                    loadSubset: async () => {
                        loads += 1
                        if (loads === 1) throw refusedLoad(id)
                        begin()
                        for (const value of rows) write({ type: 'insert', value })
                        commit()
                    },
                }
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

function settingsCollectionFor(
    opts: {
        settingsNeverReady?: boolean
        settingsFailsOnce?: boolean
        settingsErrored?: boolean
    },
    rows: BooksSettings[]
) {
    if (opts.settingsErrored) return erroredCollection<BooksSettings>()
    if (opts.settingsNeverReady) return neverReady<BooksSettings>()
    if (opts.settingsFailsOnce) return failsOnceOnDemandCollection<BooksSettings>(rows)
    return settingsCollection(rows)
}

function sequencesCollectionFor(
    opts: {
        sequencesNeverReady?: boolean
        sequencesFailsOnce?: boolean
        // A doc sequences collection whose sync fails, so the sequences query errors.
        sequencesErrored?: boolean
    },
    rows: BooksDocSequences[]
) {
    if (opts.sequencesErrored) return erroredCollection<BooksDocSequences>()
    if (opts.sequencesNeverReady) return neverReady<BooksDocSequences>()
    if (opts.sequencesFailsOnce) return failsOnceOnDemandCollection<BooksDocSequences>(rows)
    return sequencesCollection(rows)
}

function overridesCollectionFor(
    opts: {
        overridesNeverReady?: boolean
        overridesFailsOnce?: boolean
        overridesErrored?: boolean
    },
    rows: BooksCloseOverrides[]
) {
    if (opts.overridesErrored) return erroredCollection<BooksCloseOverrides>()
    if (opts.overridesNeverReady) return neverReady<BooksCloseOverrides>()
    if (opts.overridesFailsOnce) return failsOnceOnDemandCollection<BooksCloseOverrides>(rows)
    return overridesCollection(rows)
}

function usersCollectionFor(
    opts: { usersNeverReady?: boolean; usersFailsOnce?: boolean; usersErrored?: boolean },
    rows: SeedUser[]
) {
    if (opts.usersErrored) return erroredCollection<SeedUser>()
    if (opts.usersNeverReady) return neverReady<SeedUser>()
    if (opts.usersFailsOnce) return failsOnceOnDemandCollection<SeedUser>(rows)
    return local<SeedUser>('users', rows)
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
        // Refuses every write to the settings row with this error.
        refuseSettings?: unknown
        // Refuses every write to a doc sequence row with this error.
        refuseSequences?: unknown
        // The doc sequence rows to seed; none by default.
        sequences?: BooksDocSequences[]
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
        // A settings collection that never finishes loading.
        settingsNeverReady?: boolean
        // A settings collection whose first load fails and whose reload succeeds.
        settingsFailsOnce?: boolean
        // A settings collection whose sync fails, so the settings query errors.
        settingsErrored?: boolean
        // Refuses every write to a close override row with this error.
        refuseOverrides?: unknown
        // A close overrides collection that never finishes loading.
        overridesNeverReady?: boolean
        // A close overrides collection whose first load fails and whose reload succeeds.
        overridesFailsOnce?: boolean
        // A close overrides collection whose sync fails, so its query errors.
        overridesErrored?: boolean
        // The close override rows to seed; none by default.
        overrides?: BooksCloseOverrides[]
        // The users the overrides and access rows point at; none by default.
        users?: SeedUser[]
        // Replaces the signed-in user's single access row with these rows.
        accessRows?: BooksAccess[]
        // The org_pkg_access rows to seed; none by default.
        coreAccess?: OrgPkgAccess[]
        // The books_admins rows to seed; none by default.
        bookAdmins?: BooksAdmins[]
        // Lets the first `after` org_pkg_access / books_admins writes through and refuses each later one.
        refuseAccess?: { after: number; error: unknown }
        // The org_pkg_access read never finishes loading.
        coreAccessNeverReady?: boolean
        // The org_pkg_access read fails.
        coreAccessErrored?: boolean
        // The org_pkg_access read waits for releaseAccessReads().
        holdCoreRead?: boolean
        // The books_admins read never finishes loading.
        adminsNeverReady?: boolean
        // The books_admins read fails.
        adminsErrored?: boolean
        // The books_admins read waits for releaseAccessReads().
        holdAdminRead?: boolean
        // The users read never finishes loading.
        usersNeverReady?: boolean
        // The users read fails once, then loads after a retry.
        usersFailsOnce?: boolean
        // The users read fails.
        usersErrored?: boolean
        // A doc sequences collection that never finishes loading.
        sequencesNeverReady?: boolean
        // A doc sequences collection whose first load fails and whose reload succeeds.
        sequencesFailsOnce?: boolean
        // An access collection that never finishes loading, so the Books level stays unknown.
        accessNeverReady?: boolean
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
    state.refuseSettings = opts.refuseSettings ?? null
    state.refuseSequences = opts.refuseSequences ?? null
    state.refuseOverrides = opts.refuseOverrides ?? null
    state.refuseAccess = opts.refuseAccess ?? null
    state.accessEntered = 0
    state.accessInFlight = 0
    state.accessMaxInFlight = 0
    state.reloadGate = null
    state.reloadError = null
    state.releaseReads = []
    state.overrideDeletes = []
    state.log = []
    state.refuseAt = []
    state.entered = []
    state.requested = []
    state.gate = null
    state.steps = null
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
            : guarded<BooksJournalLines>('books_journal_lines', opts.ledger?.lines ?? lines),
        books_journal_entries: guarded<BooksJournalEntries>(
            'books_journal_entries',
            opts.ledger?.entries ?? []
        ),
        books_settings: settingsCollectionFor(opts, opts.ledger?.settings ?? []),
        books_doc_sequences: sequencesCollectionFor(opts, opts.sequences ?? []),
        books_access: opts.accessNeverReady
            ? neverReady<BooksAccess>()
            : accessViewCollection(opts.accessRows ?? [access]),
        org_pkg_access: accessReadCollection<OrgPkgAccess>(
            'org_pkg_access',
            opts.coreAccess ?? [],
            describeCoreWrite,
            {
                held: opts.holdCoreRead,
                neverReady: opts.coreAccessNeverReady,
                errored: opts.coreAccessErrored,
            }
        ),
        books_admins: accessReadCollection<BooksAdmins>(
            'books_admins',
            opts.bookAdmins ?? [],
            describeAdminWrite,
            {
                held: opts.holdAdminRead,
                neverReady: opts.adminsNeverReady,
                errored: opts.adminsErrored,
            }
        ),
        books_close_overrides: overridesCollectionFor(opts, opts.overrides ?? []),
        users: usersCollectionFor(opts, opts.users ?? []),
    }
}

export function accountsStore() {
    return state.registry.books_accounts as ReturnType<typeof accountsCollection>
}

// Seeded collections a register test writes to after the first render.
export function lineStore() {
    return state.registry.books_journal_lines as ReturnType<typeof guarded<BooksJournalLines>>
}

export function entryStore() {
    return state.registry.books_journal_entries as ReturnType<typeof guarded<BooksJournalEntries>>
}

export function balanceStore() {
    return state.registry.books_account_balances as ReturnType<typeof local<BooksAccountBalances>>
}

export function settingsStore() {
    return state.registry.books_settings as ReturnType<typeof settingsCollection>
}

export function sequencesStore() {
    return state.registry.books_doc_sequences as ReturnType<typeof sequencesCollection>
}

export function overridesStore() {
    return state.registry.books_close_overrides as ReturnType<typeof overridesCollection>
}

export function accessStore() {
    return state.registry.books_access as ReturnType<typeof accessViewCollection>
}

export function adminsStore() {
    return state.registry.books_admins as ReturnType<typeof accessWriteCollection<BooksAdmins>>
}

export function usersStore() {
    return state.registry.users as ReturnType<typeof local<SeedUser>>
}

export function coreAccessStore() {
    return state.registry.org_pkg_access as ReturnType<typeof accessWriteCollection<OrgPkgAccess>>
}

export function overrideDeletes() {
    return [...state.overrideDeletes]
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
