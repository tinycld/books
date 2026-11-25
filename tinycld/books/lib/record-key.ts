// The key a Books document has in its URL: its number without the prefix (the
// sequence), so `books/invoices/1005` and not the record id. A record with no number of
// its own keeps its id: a draft (sequence 0), and a document that a correction replaced,
// which shares its number with the correction (the number opens the correction).

// What a document route's key names: a sequence, or a record id.
export type RecordKey = { kind: 'sequence'; sequence: number } | { kind: 'id'; id: string }

// A record id holds 15 lower-case letters and digits; a sequence holds only digits and has
// fewer than 15, so the two never meet.
const SEQUENCE_KEY = /^[1-9][0-9]{0,13}$/

export function parseRecordKey(key: string): RecordKey {
    if (SEQUENCE_KEY.test(key)) return { kind: 'sequence', sequence: Number(key) }
    return { kind: 'id', id: key }
}

export interface KeyedDocument {
    id: string
    sequence?: number
    replaced_by?: string
}

// The URL key of a document row: its sequence when it is numbered and not replaced, else
// its id.
export function documentKey(doc: KeyedDocument): string {
    const sequence = doc.sequence ?? 0
    if (sequence > 0 && !doc.replaced_by) return String(sequence)
    return doc.id
}

export interface KeyedEntry {
    id: string
    doc_type: string
    sequence: number
    status: string
    origin: string
}

// The number of a posted entry is its own, and its document's: a document takes the
// sequence of the entry it posts. A void entry shares its number with the correction that
// replaced it, and a void reversal shares its entry's, so neither has a number of its own.
export function hasOwnNumber(entry: KeyedEntry): boolean {
    return entry.status === 'posted' && entry.sequence > 0 && entry.origin !== 'void_reversal'
}

// The entries a number opens on the entry's own screen: a journal entry on
// `books/entries/<n>`, a manual transfer on `books/transfers/<n>` (entryHref). Each doc
// type has its own sequence, so any other entry the entries screen shows (an inventory
// adjustment, the reversal of a transfer or of a document) keeps its id there.
export function isNumberedEntryRoute(entry: Pick<KeyedEntry, 'doc_type' | 'origin'>): boolean {
    if (entry.doc_type === 'journal') return true
    return entry.doc_type === 'transfer' && entry.origin === 'manual'
}

// The URL key of an entry's own screen.
export function entryKey(entry: KeyedEntry): string {
    if (isNumberedEntryRoute(entry) && hasOwnNumber(entry)) return String(entry.sequence)
    return entry.id
}

// What a customer, vendor or product route's key names: its code (lib/record-code.ts), or
// a record id. An id holds 15 lower-case letters and digits; a code is upper case, so a
// key in another case is a code typed by hand, and is read upper-cased.
export type CodeKey = { kind: 'code'; code: string } | { kind: 'id'; id: string }

const RECORD_ID = /^[a-z0-9]{15}$/

export function parseCodeKey(key: string): CodeKey {
    if (RECORD_ID.test(key)) return { kind: 'id', id: key }
    return { kind: 'code', code: key.toUpperCase() }
}
