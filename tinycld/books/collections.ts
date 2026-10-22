import type { CoreStores } from '@tinycld/core/lib/pocketbase'
import type { Schema } from '@tinycld/core/types/pbSchema'
import type { createCollection } from 'pbtsdb/core'
import { BasicIndex } from 'pbtsdb/core'

// The generated Schema already carries the books_* collections, both
// directions of every relation included.
type MergedSchema = Schema

const indexed = {
    autoIndex: 'eager' as const,
    defaultIndexType: BasicIndex,
}

// Only the rows a live query asks for enter the store, and realtime covers
// exactly those rows. A register or report never loads the whole ledger.
const onDemand = { syncMode: 'on-demand', realtime: 'query' } as const

export function registerCollections(
    newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    coreStores: CoreStores
) {
    // `currency` is stamped by the server from books_settings.
    const books_accounts = newCollection('books_accounts', {
        omitOnInsert: ['created', 'updated', 'currency'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    // Created before entries so the entry's back-relation can name it.
    // posted, date and currency are stamped when the entry posts.
    const books_journal_lines = newCollection('books_journal_lines', {
        omitOnInsert: ['created', 'updated', 'posted', 'date', 'currency'] as const,
        ...onDemand,
        relations: { account: books_accounts },
        collectionOptions: indexed,
    })

    // Every field below the omit line is Books' own: the number and totals
    // are assigned at posting, who and when by the request, the override by
    // the close-date check.
    const books_journal_entries = newCollection('books_journal_entries', {
        omitOnInsert: [
            'created',
            'updated',
            'number',
            'sequence',
            'total',
            'posted_at',
            'posted_by',
            'voided_at',
            'voided_by',
            'created_by',
            'close_override',
            'currency',
        ] as const,
        ...onDemand,
        relations: {
            books_journal_lines_via_entry: books_journal_lines,
            posted_by: coreStores.users,
            created_by: coreStores.users,
        },
        collectionOptions: indexed,
    })

    // Server-maintained; reports read these instead of summing lines.
    const books_account_balances = newCollection('books_account_balances', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: { account: books_accounts },
        collectionOptions: indexed,
    })

    const books_settings = newCollection('books_settings', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_doc_sequences = newCollection('books_doc_sequences', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        collectionOptions: indexed,
    })

    const books_close_overrides = newCollection('books_close_overrides', {
        omitOnInsert: ['created', 'updated', 'granted_by'] as const,
        ...onDemand,
        relations: { user: coreStores.users },
        collectionOptions: indexed,
    })

    const books_admins = newCollection('books_admins', {
        omitOnInsert: ['created', 'updated'] as const,
        ...onDemand,
        relations: { user: coreStores.users },
        collectionOptions: indexed,
    })

    // A view: read only, and it emits no realtime events, so a level change
    // reaches an open app on its next reload or foreground.
    const books_access = newCollection('books_access', {
        ...onDemand,
        collectionOptions: indexed,
    })

    return {
        books_accounts,
        books_journal_lines,
        books_journal_entries,
        books_account_balances,
        books_settings,
        books_doc_sequences,
        books_close_overrides,
        books_admins,
        books_access,
    }
}
