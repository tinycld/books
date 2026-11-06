import { describe, expect, it } from 'vitest'
import {
    BANK_ACCOUNT_IDS,
    BANK_CONNECTION_IDS,
    BANK_CONNECTIONS,
    BANK_CSV_SAMPLE,
    BANK_FILES,
    BANK_LONG_FILE_NAME,
    BANK_OFX_SAMPLE,
    BANK_SEED,
    BANK_SEED_FILE,
} from '../tinycld/books/lib/bank-connection-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import type { BooksBankConnections, BooksBankFiles } from '../tinycld/books/types'

// Compile-time checks: tsc refuses them until the books_banking migration exists,
// the types are generated again, and the fixture rows match the generated rows.
const row: BooksBankFiles = BANK_FILES[0]
const conn: BooksBankConnections = BANK_CONNECTIONS[0]

const MB = 1_048_576
const MAX_BANK_FILE_BYTES = 5_242_880
// books-settings.spec.ts holds a close date of 2026-06-30 on the shared e2e DB.
const LAST_CLOSED_DAY = '2026-06-30'

function seedAccount(number: string) {
    return SEED_ACCOUNTS.find(account => account.number === number)
}

describe('bank connection fixture', () => {
    it('files the newest upload on the first connection, the checking account', () => {
        expect(conn.account).toBe(BANK_ACCOUNT_IDS.checking)
        expect(row.connection).toBe(conn.id)
    })

    it('puts every file on the checking connection, waiting to import', () => {
        for (const file of BANK_FILES) {
            expect({ id: file.id, connection: file.connection, status: file.status }).toEqual({
                id: file.id,
                connection: BANK_CONNECTION_IDS.checking,
                status: 'uploaded',
            })
        }
    })

    it('lists the files newest upload first', () => {
        const created = BANK_FILES.map(file => file.created)
        expect(created).toEqual([...created].sort().reverse())
        expect(new Set(created).size).toBe(created.length)
    })

    it('has a 60-character file name that a row must truncate', () => {
        expect(BANK_LONG_FILE_NAME.length).toBe(60)
        expect(BANK_FILES.map(file => file.name)).toContain(BANK_LONG_FILE_NAME)
    })

    it('has exactly one file between 1 MB and the 5 MB limit', () => {
        const large = BANK_FILES.filter(file => file.size > MB && file.size < MAX_BANK_FILE_BYTES)
        expect(large.map(file => file.id)).toHaveLength(1)
    })

    it('has both CSV and OFX files', () => {
        const formats = new Set(BANK_FILES.map(file => file.format))
        expect(formats.has('csv')).toBe(true)
        expect(formats.has('ofx')).toBe(true)
    })

    it('seeds a connection on the seeded checking account and the seeded card', () => {
        const numbers = BANK_SEED.connections.map(connection => connection.accountNumber)
        expect([...numbers].sort()).toEqual(['1000', '2100'])
        expect(seedAccount('1000')?.type).toBe('bank')
        expect(seedAccount('2100')?.type).toBe('credit_card')
    })

    it('leaves 1010 Business Savings unconnected for the e2e spec', () => {
        expect(seedAccount('1010')?.type).toBe('bank')
        const numbers = BANK_SEED.connections.map(connection => connection.accountNumber)
        expect(numbers).not.toContain('1010')
    })

    it('seeds one CSV file on checking and none on the card', () => {
        expect(BANK_SEED_FILE.name.endsWith('.csv')).toBe(true)
        const filesByAccount = Object.fromEntries(
            BANK_SEED.connections.map(connection => [
                connection.accountNumber,
                connection.files.map(file => file.name),
            ])
        )
        expect(filesByAccount).toEqual({ '1000': [BANK_SEED_FILE.name], '2100': [] })
    })

    it('has a CSV sample with a header and six rows dated after the close date', () => {
        const lines = BANK_CSV_SAMPLE.split('\n').filter(line => line.trim() !== '')
        expect(lines[0]).toBe('Date,Description,Amount')
        const days = lines.slice(1).map(line => line.split(',')[0])
        expect(days).toHaveLength(6)
        for (const day of days) {
            expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(day > LAST_CLOSED_DAY, day).toBe(true)
        }
    })

    it('has an OFX sample with a header and six transactions dated after the close date', () => {
        expect(BANK_OFX_SAMPLE.startsWith('OFXHEADER')).toBe(true)
        expect(BANK_OFX_SAMPLE.split('<STMTTRN>')).toHaveLength(7)
        const posted = [...BANK_OFX_SAMPLE.matchAll(/<DTPOSTED>(\d{8})/g)].map(
            match => `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6)}`
        )
        expect(posted).toHaveLength(6)
        for (const day of posted) {
            expect(day > LAST_CLOSED_DAY, day).toBe(true)
        }
    })
})
