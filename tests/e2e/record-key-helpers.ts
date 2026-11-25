import { expect, type Page } from '@playwright/test'
import {
    documentKey,
    entryKey,
    type KeyedEntry,
    parseRecordKey,
} from '../../tinycld/books/lib/record-key'
import { authToken } from './estimate-public-link-helpers'

// A Books record's URL holds its URL key (lib/record-key.ts): a document's number without
// its prefix, or its id while it has none. A spec that needs the record id behind a URL,
// or the URL of a record it knows by id, goes through these. They only read (PocketBase
// REST with the signed-in user's token), as CLAUDE.md allows for assertions.

// The entry screens and the doc type whose number each opens.
const ENTRY_ROUTE_TYPES: Record<string, 'journal' | 'transfer'> = {
    entries: 'journal',
    transfers: 'transfer',
}

// The collection behind each document route.
const DOCUMENT_COLLECTIONS: Record<string, string> = {
    invoices: 'books_invoices',
    estimates: 'books_estimates',
    'sales-receipts': 'books_sales_receipts',
    payments: 'books_payments',
    'credit-memos': 'books_credit_memos',
    'refund-receipts': 'books_refund_receipts',
    statements: 'books_statements',
    bills: 'books_bills',
    expenses: 'books_expenses',
    'bill-payments': 'books_bill_payments',
    'vendor-credits': 'books_vendor_credits',
    'vendor-refunds': 'books_vendor_refunds',
    deposits: 'books_deposits',
    'write-offs': 'books_write_offs',
}

type Row = {
    id: string
    sequence?: number
    replaced_by?: string
    status?: string
    origin?: string
    doc_type?: string
}

// Whether the records of `route` take a URL key, not always their id.
export function isRecordKeyRoute(route: string): boolean {
    return route in ENTRY_ROUTE_TYPES || route in DOCUMENT_COLLECTIONS
}

function collectionOf(route: string): string {
    if (route in ENTRY_ROUTE_TYPES) return 'books_journal_entries'
    const collection = DOCUMENT_COLLECTIONS[route]
    if (!collection) throw new Error(`no Books record route "${route}"`)
    return collection
}

async function readRows(page: Page, collection: string, filter: string): Promise<Row[]> {
    const response = await page.request.get(`/api/collections/${collection}/records`, {
        params: { filter, perPage: '50' },
        headers: { Authorization: await authToken(page) },
    })
    expect(response.ok(), `read ${collection} where ${filter}`).toBe(true)
    return ((await response.json()) as { items: Row[] }).items
}

// The record id a URL key of `route` names (`invoices`, `entries`, …).
export async function recordIdOfKey(page: Page, route: string, key: string): Promise<string> {
    const parsed = parseRecordKey(key)
    if (parsed.kind === 'id') return parsed.id
    const collection = collectionOf(route)
    const docType = ENTRY_ROUTE_TYPES[route]
    // A void entry keeps its number on the screen that showed it (the route keeps the
    // record it first read), so an entry's number names the posted entry, else the void one.
    const filter = docType
        ? `doc_type="${docType}" && sequence=${parsed.sequence} && origin!="void_reversal"`
        : `sequence=${parsed.sequence}`
    const rows = await readRows(page, collection, filter)
    const row = rows.find(r => r.status === 'posted') ?? rows.find(r => !r.replaced_by) ?? rows[0]
    if (!row) throw new Error(`no ${collection} row with sequence ${parsed.sequence}`)
    return row.id
}

// The record id of the record the page's URL opens on `route`
// (`…/books/invoices/1005` → the invoice's id). The id URL a save leaves before the route
// swaps in the number names the same record, so the URL may be read at either point.
export async function recordIdFromUrl(page: Page, route: string): Promise<string> {
    const match = new RegExp(`/books/${route}/([^/?#]+)/?$`).exec(new URL(page.url()).pathname)
    if (!match?.[1] || match[1] === 'new')
        throw new Error(`the URL ${page.url()} is no saved ${route} record`)
    return recordIdOfKey(page, route, match[1])
}

async function keyOf(page: Page, route: string, id: string): Promise<string | undefined> {
    const [row] = await readRows(page, collectionOf(route), `id="${id}"`)
    if (!row) return undefined
    if (route in ENTRY_ROUTE_TYPES) {
        const entry: KeyedEntry = {
            id: row.id,
            doc_type: row.doc_type ?? '',
            sequence: row.sequence ?? 0,
            status: row.status ?? '',
            origin: row.origin ?? '',
        }
        return row.doc_type === ENTRY_ROUTE_TYPES[route] ? entryKey(entry) : row.id
    }
    return documentKey(row)
}

// The URL key of the record `id` of `route`, read now.
export async function urlKeyOf(page: Page, route: string, id: string): Promise<string> {
    const key = await keyOf(page, route, id)
    if (!key) throw new Error(`no ${route} record ${id}`)
    return key
}

function isOnRecord(page: Page, route: string, key: string): boolean {
    return new RegExp(`/books/${route}/${key}$`).test(page.url())
}

// Waits until the page is on the record `id` of `route`, by its number or by its id. A
// link that knows only the id (search, a link between records, the audit log) opens the
// id URL; a list, a report link and a save open the number. A save may reach the server
// after the URL changed, so the check reads the key again on each try.
export async function expectRecordUrl(page: Page, route: string, id: string): Promise<void> {
    await expect
        .poll(
            async () => {
                const key = (await keyOf(page, route, id)) ?? id
                return isOnRecord(page, route, key) || isOnRecord(page, route, id)
            },
            { message: `the page is on the ${route} record ${id}` }
        )
        .toBe(true)
}

// Waits until the page is on the record `id` of `route` by its number: where the app
// opens it by number (a list row, a report link, the read view after a post).
export async function expectRecordNumberUrl(page: Page, route: string, id: string): Promise<void> {
    await expect
        .poll(
            async () => {
                const key = await keyOf(page, route, id)
                return key !== undefined && key !== id && isOnRecord(page, route, key)
            },
            { message: `the page is on the ${route} record ${id} by its number` }
        )
        .toBe(true)
}

// Waits until the page is on no URL of the record `id` of `route`: neither its id nor
// its number.
export async function expectNotRecordUrl(page: Page, route: string, id: string): Promise<void> {
    await expect
        .poll(
            async () => {
                const key = (await keyOf(page, route, id)) ?? id
                return isOnRecord(page, route, key) || isOnRecord(page, route, id)
            },
            { message: `the page has left the ${route} record ${id}` }
        )
        .toBe(false)
}
