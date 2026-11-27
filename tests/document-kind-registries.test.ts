import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DOCUMENT_SCREENS, ENTRY_SCREENS } from '../tinycld/books/hooks/useRouteRecordId'
import { isAuditedCollection } from '../tinycld/books/lib/audit-fields'
import { AUDIT_RECORD_TYPE_OPTIONS } from '../tinycld/books/lib/audit-log'
import { auditRecordHref, ROUTED_DOC_TYPES } from '../tinycld/books/lib/audit-record-route'
import { DOC_TYPES } from '../tinycld/books/lib/doc-types'
import { SEND_KINDS } from '../tinycld/books/lib/document-send'
import { DOCUMENT_COLLECTIONS } from '../tinycld/books/lib/history-route'
import { NEW_ACTIONS } from '../tinycld/books/lib/new-actions'
import { PURCHASE_TABS, vendorTransactionsTab } from '../tinycld/books/lib/purchase-lists'
import { DOC_TYPE_LABELS } from '../tinycld/books/lib/register'
import { customerTransactionsTab, SALES_TABS } from '../tinycld/books/lib/sales-lists'
import { searchTarget } from '../tinycld/books/lib/search-target'
import { SEND_DOC_TYPES } from '../tinycld/books/lib/send-doc-types'

// A new document kind (a new entry in cli/documents.json, the one definition of the
// transaction types) must reach each per-kind table of the client. Each table below lists
// every kind, or names it in the table's exclusions with the reason. An excluded kind that
// the table lists fails too, so an exclusion is removed when its kind is added. The server
// and CLI tables have the same check in server/document_kind_registries_test.go.

const documentsSchema = z.object({
    documents: z
        .array(
            z.object({
                name: z.string(),
                collection: z.string(),
                fixed: z.record(z.string(), z.string()).optional(),
                lines: z.array(z.object({ collection: z.string() })).optional(),
            })
        )
        .min(1),
})

const DOCUMENTS_FILE = join(__dirname, '..', 'cli', 'documents.json')

// Each kind with its doc type (an entry kind's fixed doc type, else its collection's name in
// the singular) and its route (journal entries open at books/entries).
const KINDS = documentsSchema
    .parse(JSON.parse(readFileSync(DOCUMENTS_FILE, 'utf8')))
    .documents.map(doc => {
        const key = doc.fixed?.doc_type ?? doc.collection.replace(/^books_/, '').replace(/s$/, '')
        const route = key === 'journal' ? 'entries' : doc.name
        // The server computes a tax line from its document's lines, so the audit rows of
        // those lines and of the document already record each change.
        const auditedLines = (doc.lines ?? [])
            .map(line => line.collection)
            .filter(collection => !collection.endsWith('_tax_lines'))
        return { key, route, collection: doc.collection, auditedLines }
    })

type Kind = (typeof KINDS)[number]

// The kind is the unit's work in progress: move it into the table when its part is built.
const ADJUSTMENT_PENDING = "p7-inventory-adjust builds the inventory adjustment's screens"
const NEVER_POSTS = 'it never posts, so no entry carries its doc type'
const NOT_SENT =
    'Books sends only what a customer or a vendor receives: the sales documents and the purchase order'
const NO_LIST_TAB = 'it is no sales or purchase document, so no sales or purchase list tab lists it'

function excluding(keys: readonly string[], reason: string): Record<string, string> {
    return Object.fromEntries(keys.map(key => [key, reason]))
}

const NOT_SENT_KINDS = [
    'journal',
    'transfer',
    'bill',
    'expense',
    'vendor_credit',
    'payment',
    'bill_payment',
    'vendor_refund',
    'write_off',
    'deposit',
    'inventory_adjustment',
]

// A write-off is in no Sales tab: the customer page's transactions tab lists it.
const LIST_TABS = [
    ...SALES_TABS,
    ...PURCHASE_TABS,
    customerTransactionsTab('all'),
    vendorTransactionsTab('all'),
]
const LISTED_KINDS = new Set<string>(LIST_TABS.flatMap(tab => tab.kinds))

const DOCUMENT_SCREEN_OF = new Map<string, string>(Object.entries(DOCUMENT_SCREENS))
const ENTRY_SCREEN_OF = new Map<string, string>(Object.entries(ENTRY_SCREENS))
const COLLECTION_OF = new Map<string, string>(Object.entries(DOCUMENT_COLLECTIONS))
const RECORD_TYPES = new Set(AUDIT_RECORD_TYPE_OPTIONS.map(option => option.value))

// The New menu opens a bill payment from Pay bills.
function newHrefOf(kind: Kind): string {
    if (kind.key === 'bill_payment') return 'books/pay-bills'
    return `books/${kind.route}/new`
}

function routeScreenOf(kind: Kind): string | undefined {
    return DOCUMENT_SCREEN_OF.get(kind.collection) ?? ENTRY_SCREEN_OF.get(kind.key)
}

type Registry = {
    name: string
    has: (kind: Kind) => boolean
    excluded: Record<string, string>
}

const REGISTRIES: Registry[] = [
    {
        name: 'DOC_TYPES (lib/doc-types.ts)',
        has: kind => kind.key in DOC_TYPES,
        excluded: {},
    },
    {
        name: 'DOCUMENT_COLLECTIONS (lib/history-route.ts)',
        has: kind => COLLECTION_OF.get(kind.key) === kind.collection,
        excluded: {
            journal: "an entry's history opens by its doc type (audit-record-route.ts entryPath)",
            transfer: "an entry's history opens by its doc type (audit-record-route.ts entryPath)",
            payment: 'no document kind: RECORD_PATHS of lib/audit-record-route.ts opens it',
            bill_payment: 'no document kind: RECORD_PATHS of lib/audit-record-route.ts opens it',
            inventory_adjustment: ADJUSTMENT_PENDING,
        },
    },
    {
        name: "auditRecordHref (lib/audit-record-route.ts): the history's Open path",
        has: kind =>
            auditRecordHref(kind.collection, 'rec000000000001', {
                doc_type: kind.key,
                origin: 'manual',
            })?.startsWith(`books/${kind.route}/`) ?? false,
        excluded: { inventory_adjustment: ADJUSTMENT_PENDING },
    },
    {
        name: 'AUDIT_RECORD_TYPE_OPTIONS (lib/audit-log.ts), the kind and its lines',
        has: kind => [kind.collection, ...kind.auditedLines].every(c => RECORD_TYPES.has(c)),
        excluded: {},
    },
    {
        name: 'AUDIT_FIELDS (lib/audit-fields.ts), the kind and its lines',
        has: kind => [kind.collection, ...kind.auditedLines].every(isAuditedCollection),
        excluded: {},
    },
    {
        name: 'ROUTED_DOC_TYPES (lib/audit-record-route.ts)',
        has: kind => ROUTED_DOC_TYPES.includes(kind.key),
        excluded: excluding(['estimate', 'purchase_order'], NEVER_POSTS),
    },
    {
        name: 'DOC_TYPE_LABELS (lib/register.ts)',
        has: kind => kind.key in DOC_TYPE_LABELS,
        excluded: {
            journal: 'an entry made by hand is labelled by its origin (originLabels)',
            ...excluding(['estimate', 'purchase_order'], NEVER_POSTS),
        },
    },
    {
        name: 'searchTarget (lib/search-target.ts)',
        has: kind => {
            const searchKind = kind.key === 'journal' ? 'entry' : kind.key
            return searchTarget(`${searchKind}:rec1`)?.path === `books/${kind.route}/[id]`
        },
        excluded: { inventory_adjustment: ADJUSTMENT_PENDING },
    },
    {
        name: 'route keys: DOCUMENT_SCREENS and ENTRY_SCREENS (hooks/useRouteRecordId.ts)',
        has: kind => routeScreenOf(kind) === `${kind.route}/[id]`,
        excluded: { inventory_adjustment: ADJUSTMENT_PENDING },
    },
    {
        name: 'NEW_ACTIONS (lib/new-actions.ts)',
        has: kind => NEW_ACTIONS.some(action => action.href === newHrefOf(kind)),
        excluded: {
            write_off: "it is made from an invoice's Write off action, never from New",
            inventory_adjustment: ADJUSTMENT_PENDING,
        },
    },
    {
        name: 'SEND_KINDS (lib/document-send.ts)',
        has: kind => SEND_KINDS.some(send => send === kind.key),
        excluded: excluding(NOT_SENT_KINDS, NOT_SENT),
    },
    {
        name: 'SEND_DOC_TYPES (lib/send-doc-types.ts)',
        has: kind => SEND_DOC_TYPES.some(send => send === kind.key),
        excluded: excluding(NOT_SENT_KINDS, NOT_SENT),
    },
    {
        name: 'the sales, purchase, customer and vendor list tabs (lib/sales-lists.ts, lib/purchase-lists.ts)',
        has: kind => LISTED_KINDS.has(kind.key),
        excluded: excluding(
            ['journal', 'transfer', 'deposit', 'inventory_adjustment'],
            NO_LIST_TAB
        ),
    },
]

const KIND_KEYS = KINDS.map(kind => kind.key)

describe.each(REGISTRIES)('$name', ({ has, excluded }) => {
    it('excludes only kinds of cli/documents.json', () => {
        expect(KIND_KEYS).toEqual(expect.arrayContaining(Object.keys(excluded)))
    })

    it.each(KINDS)('lists $key, or excludes it with the reason', kind => {
        const isExcluded = kind.key in excluded
        expect(has(kind), isExcluded ? `excluded: ${excluded[kind.key]}` : 'missing').toBe(
            !isExcluded
        )
    })
})
