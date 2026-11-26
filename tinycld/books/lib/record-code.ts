import { deriveCode, uniqueKey } from '@tinycld/core/lib/short-code'
import { z } from '@tinycld/core/ui/form'

// A customer's, vendor's or product's code: the short name a person types to find it.
// The server owns it (server/record_codes.go): an empty code is generated from the name,
// a sent one is normalized and checked. The texts below are the server's.

export const RECORD_CODE_MAX = 15

export type RecordCodeKind = 'customer' | 'vendor' | 'product'

// The collections whose rows carry a code.
export type CodedCollectionName = 'books_customers' | 'books_vendors' | 'books_products'

export const RECORD_CODE_BASES: Record<RecordCodeKind, string> = {
    customer: 'CUST',
    vendor: 'VEND',
    product: 'ITEM',
}

export const CODE_SHAPE_MESSAGE =
    'A code is 2 to 15 capital letters, digits or dashes, and starts with a letter or digit.'
export const CODE_RESERVED_MESSAGE = 'NEW cannot be a code.'

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,14}$/
// The create route's segment (books/<type>/new).
const RESERVED = 'NEW'
// The longest suffix the stem leaves room for ("-NNN").
const SUFFIX_ROOM = 4

// '' means "let the server make one from the name".
export const recordCodeSchema = z
    .string()
    .transform(value => value.trim().toUpperCase())
    .refine(value => value === '' || CODE_PATTERN.test(value), CODE_SHAPE_MESSAGE)
    .refine(value => value !== RESERVED, CODE_RESERVED_MESSAGE)

// The code a name gives before any suffix: its derived code, or the kind's base when the
// name gives none (or NEW).
export function suggestedBase(name: string, kind: RecordCodeKind): string {
    const derived = deriveCode(name, { max: RECORD_CODE_MAX })
    if (derived === '' || derived === RESERVED) return RECORD_CODE_BASES[kind]
    return derived
}

// The code the server gives this name when the code is left empty, given the codes the
// collection holds.
export function suggestedCode(
    name: string,
    kind: RecordCodeKind,
    taken: ReadonlySet<string>
): string {
    return uniqueKey(suggestedBase(name, kind), taken, {
        separator: '-',
        max: RECORD_CODE_MAX,
    })
}

// Every variant uniqueKey can make from base (up to -999) starts with this.
export function codeStem(base: string): string {
    return base.slice(0, RECORD_CODE_MAX - SUFFIX_ROOM)
}

export function matchesNameOrCode(term: string, name: string, code: string | undefined): boolean {
    const needle = term.trim().toLowerCase()
    if (needle === '') return true
    return name.toLowerCase().includes(needle) || (code ?? '').toLowerCase().includes(needle)
}

// The rows whose code starts with the term first; the order is kept within each group.
export function codeFirst<T>(
    rows: readonly T[],
    term: string,
    codeOf: (row: T) => string | undefined
): T[] {
    const needle = term.trim().toUpperCase()
    if (needle === '') return [...rows]
    const isCodeHit = (row: T) => (codeOf(row) ?? '').startsWith(needle)
    return [...rows.filter(isCodeHit), ...rows.filter(row => !isCodeHit(row))]
}
