import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
    APPLY_CREDIT_MEMOS,
    APPLY_CREDIT_REFUNDS,
    APPLY_CREDIT_TEXTS,
    type ApplyCreditMemoRecord,
    applicationsOfMemo,
    type CreditMemoApplicationRecord,
} from '../tinycld/books/lib/apply-credit-fixture'
import type { BooksCreditMemoApplications, BooksCreditMemos } from '../tinycld/books/types'

// Apply credit spec §4.1–§4.2: the fixture's rows are the generated ones, so a column the
// migration adds or drops fails the type check here.
describe('apply credit fixture types', () => {
    it('types an application and a credit memo as the generated records', () => {
        expectTypeOf<CreditMemoApplicationRecord>().toEqualTypeOf<BooksCreditMemoApplications>()
        expectTypeOf<ApplyCreditMemoRecord>().toEqualTypeOf<BooksCreditMemos>()
    })
})

// Spec §4.2: a memo's applied is the sum of its applications, and its balance is what is
// left after the applications and the refunds, as the server's verify reads them.
describe('apply credit fixture memos', () => {
    it.each(
        APPLY_CREDIT_MEMOS.map(memo => [memo.id, memo] as const)
    )('%s: applied is the sum of its applications, and balance = total − applied − refunds', (_, memo) => {
        const applied = applicationsOfMemo(memo.id).reduce((sum, row) => sum + row.amount, 0)
        const refunded = APPLY_CREDIT_REFUNDS.filter(row => row.document === memo.id).reduce(
            (sum, row) => sum + row.amount,
            0
        )
        expect(memo.applied).toBe(applied)
        expect(memo.balance).toBe(memo.total - memo.applied - refunded)
    })
})

// The server's texts the fixture quotes, found in the Go source that writes them.
const GO_SOURCES = [
    'credit_memo_applications.go',
    'credit_applications.go',
    'credit_memos.go',
    'invoices.go',
    'posting.go',
]

// A missing Go file throws, so a renamed source fails here instead of hiding a text.
function goSource(): string {
    return GO_SOURCES.map(file => readFileSync(join(__dirname, '..', 'server', file), 'utf8')).join(
        '\n'
    )
}

// The server's format for a Go const, as a pattern where each %s is an ISO day.
function goFormatPattern(source: string, name: string): RegExp {
    const declaration = source.match(new RegExp(`const ${name} = ("(?:[^"\\\\]|\\\\.)*")`))
    if (!declaration) throw new Error(`no const ${name} in the Go sources`)
    const format: string = JSON.parse(declaration[1])
    const escaped = format
        .split('%s')
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\d{4}-\\d{2}-\\d{2}')
    return new RegExp(`^${escaped}$`)
}

describe('apply credit fixture texts', () => {
    const source = goSource()

    it.each([
        ['memoVoidRefused', APPLY_CREDIT_TEXTS.memoVoidRefused],
        ['invoiceVoidRefused', APPLY_CREDIT_TEXTS.invoiceVoidRefused],
        ['notChanged', APPLY_CREDIT_TEXTS.notChanged],
    ])('%s is the server’s text', (_, text) => {
        expect(source).toContain(JSON.stringify(text))
    })

    // A remove on or before the close date is refused by the ledger's close-date check.
    it('removeRefused is the server’s close-date refusal (msgClosedThrough)', () => {
        expect(APPLY_CREDIT_TEXTS.removeRefused).toMatch(
            goFormatPattern(source, 'msgClosedThrough')
        )
    })
})
