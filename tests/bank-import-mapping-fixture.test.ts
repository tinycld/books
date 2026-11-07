import { describe, expect, it } from 'vitest'
import { BANK_SEED_FILE } from '../tinycld/books/lib/bank-connection-fixture'
import {
    BANK_IMPORT_CHECKING_ROWS,
    BANK_IMPORT_ERROR_LINES,
    BANK_IMPORT_FILES,
    BANK_IMPORT_SEED_STATEMENT,
} from '../tinycld/books/lib/bank-import-mapping-fixture'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'

function ledgerBalance(text: string) {
    const block = /<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/.exec(text)?.[1] ?? ''
    return {
        block,
        amount: /<BALAMT>([^<\s]+)/.exec(block)?.[1] ?? '',
        day: /<DTASOF>(\d{8})/.exec(block)?.[1] ?? '',
    }
}

describe('BANK_IMPORT_SEED_STATEMENT', () => {
    it('belongs to the seeded credit card account', () => {
        expect(BANK_IMPORT_SEED_STATEMENT.accountNumber).toBe('2100')
        const account = SEED_ACCOUNTS.find(
            row => row.number === BANK_IMPORT_SEED_STATEMENT.accountNumber
        )
        expect(account?.type).toBe('credit_card')
    })

    it('is an OFX file with another name than the seeded checking file', () => {
        expect(BANK_IMPORT_SEED_STATEMENT.name.endsWith('.ofx')).toBe(true)
        expect(BANK_IMPORT_SEED_STATEMENT.name).not.toBe(BANK_SEED_FILE.name)
    })

    it('is a card statement with the ledger balance of the reference card file', () => {
        const { text } = BANK_IMPORT_SEED_STATEMENT
        expect(text.startsWith('OFXHEADER')).toBe(true)
        expect(text).toContain('<CCSTMTRS>')
        const ledger = ledgerBalance(text)
        expect(ledger.block).toContain('<BALAMT>-3410.17')
        expect(ledger.block).toContain('<DTASOF>20261028')

        const cardFile = BANK_IMPORT_FILES.find(file => file.name === 'card-2026-10.ofx')
        expect(cardFile?.statement_balance).toBe(-341_017)
        expect(cardFile?.statement_date).toBe('2026-10-28')
        expect(Math.round(Number(ledger.amount) * 100)).toBe(cardFile?.statement_balance)
        const day = `${ledger.day.slice(0, 4)}-${ledger.day.slice(4, 6)}-${ledger.day.slice(6, 8)}`
        expect(day).toBe(cardFile?.statement_date)
        expect(BANK_IMPORT_SEED_STATEMENT.name).toBe(cardFile?.name)
    })
})

describe('the checking CSV fixture', () => {
    it('has a header and 40 rows, three of which the guessed mapping cannot read', () => {
        expect(BANK_IMPORT_CHECKING_ROWS).toHaveLength(41)
        expect(BANK_IMPORT_ERROR_LINES).toEqual([14, 19, 27])
    })
})
