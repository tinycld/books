import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import { isIsoDay } from '../tinycld/books/lib/register-range'
import {
    STATEMENT_BALANCE_FORWARD_SHIPPED_KEY,
    STATEMENT_OPEN_ITEMS_SHIPPED_KEY,
} from '../tinycld/books/lib/shipped-reports'
import { STATEMENT_SEED, type StatementRecord } from '../tinycld/books/lib/statements-fixture'
import type { BooksStatements } from '../tinycld/books/types'

// Statements spec §4.2, §4.7 and plan note 9: the fixture is typed by the generated
// collection, the seed rows name seeded customers and pass the shared date rule, and the
// client's shipped keys are the server's.

const SERVER_DIR = join(__dirname, '..', 'server')

type DateCase = {
    name: string
    type: 'balance_forward' | 'open_items'
    statementDate: string
    startDate: string
    endDate: string
    field: '' | 'statement_date' | 'start_date' | 'end_date'
    message: string
    go?: boolean
}

const DATE_CASES: DateCase[] = JSON.parse(
    readFileSync(join(SERVER_DIR, 'testdata', 'statement_date_cases.json'), 'utf8')
)

// The date rule of the case table, field by field, as the create guard runs it: the
// refused field, or '' when the dates are taken.
function refusedField(row: {
    type: string
    statement_date: string
    start_date: string
    end_date: string
}): string {
    if (!isIsoDay(row.statement_date)) return 'statement_date'
    if (row.type === 'open_items') {
        if (row.start_date !== '') return 'start_date'
        return row.end_date === '' ? '' : 'end_date'
    }
    if (row.start_date === '' || !isIsoDay(row.start_date)) return 'start_date'
    if (row.end_date === '' || !isIsoDay(row.end_date)) return 'end_date'
    if (row.start_date > row.end_date) return 'start_date'
    if (row.end_date > row.statement_date) return 'end_date'
    return ''
}

describe('statements fixture', () => {
    it('types StatementRecord as the generated BooksStatements', () => {
        expectTypeOf<StatementRecord>().toEqualTypeOf<BooksStatements>()
    })

    it('reads the case table with the rule the seed rows are checked by', () => {
        expect(DATE_CASES.length).toBeGreaterThan(0)
        for (const c of DATE_CASES) {
            const field = refusedField({
                type: c.type,
                statement_date: c.statementDate,
                start_date: c.startDate,
                end_date: c.endDate,
            })
            expect(field, c.name).toBe(c.field)
        }
    })

    it('names a seeded customer and passes the date rule in every seed row', () => {
        const seeded = new Set(CUSTOMERS.map(row => row.id))
        const named = new Set<string>(Object.values(CUSTOMER_IDS))
        expect(STATEMENT_SEED).toHaveLength(2)
        for (const row of STATEMENT_SEED) {
            expect(named.has(row.customer), row.customer).toBe(true)
            expect(seeded.has(row.customer), row.customer).toBe(true)
            expect(refusedField(row), `${row.type} ${row.statement_date}`).toBe('')
        }
        expect(STATEMENT_SEED.map(row => row.type).sort()).toEqual([
            'balance_forward',
            'open_items',
        ])
    })

    it('ships the client keys the server registers', () => {
        expect(STATEMENT_BALANCE_FORWARD_SHIPPED_KEY).toBe('books.statement_balance_forward')
        expect(STATEMENT_OPEN_ITEMS_SHIPPED_KEY).toBe('books.statement_open_items')
        const source = readFileSync(join(SERVER_DIR, 'report_statements.go'), 'utf8')
        expect(source).toContain(`"${STATEMENT_BALANCE_FORWARD_SHIPPED_KEY}"`)
        expect(source).toContain(`"${STATEMENT_OPEN_ITEMS_SHIPPED_KEY}"`)
    })
})
