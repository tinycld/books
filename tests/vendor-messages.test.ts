import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    duplicateVendorNameMessage,
    EXPENSE_ACCOUNT_INACTIVE,
    EXPENSE_ACCOUNT_LEDGER,
    EXPENSE_ACCOUNT_MISSING,
    UNSAVED_VENDOR_DELETE_WARNING,
    VENDOR_DISCARD_MESSAGE,
    VENDOR_LOAD_ERROR,
    VENDOR_NOT_SAVED,
    VENDOR_SAVE_FAILED,
    VENDOR_SAVE_TEXTS,
} from '../tinycld/books/lib/vendor-messages'

// Read inside the test, so a missing server file fails the drift test only.
function serverSource(file: string) {
    return readFileSync(join(__dirname, '..', 'server', file), 'utf8')
}

const ADDRESS_SHAPE =
    'An address has only street, street line 2, city, state or region, postal code and country, each at most 200 characters.'

describe('duplicateVendorNameMessage', () => {
    it('names the duplicate', () => {
        expect(duplicateVendorNameMessage('Acme')).toBe('A vendor named “Acme” already exists.')
    })
})

describe('client copies', () => {
    it('are the texts of the plan Decisions', () => {
        expect(VENDOR_NOT_SAVED).toBe('The vendor was not saved.')
        expect(VENDOR_SAVE_FAILED).toBe('Books could not save this vendor.')
        expect(UNSAVED_VENDOR_DELETE_WARNING).toBe('Unsaved changes to this vendor will be lost.')
        expect(VENDOR_DISCARD_MESSAGE).toBe('This vendor has changes that are not saved.')
        expect(VENDOR_LOAD_ERROR).toBe('Could not load vendors')
        expect(EXPENSE_ACCOUNT_MISSING).toBe('The expense account does not exist.')
        expect(EXPENSE_ACCOUNT_INACTIVE).toBe('The expense account is inactive.')
        expect(EXPENSE_ACCOUNT_LEDGER).toBe(
            "A vendor's default expense account cannot be Accounts receivable or Accounts payable."
        )
    })

    it('VENDOR_SAVE_TEXTS puts each save text in its slot', () => {
        expect(VENDOR_SAVE_TEXTS).toEqual({
            logContext: 'books.vendors',
            notSavedTitle: 'The vendor was not saved.',
            clientSaveFailed: 'Books could not save this vendor.',
        })
    })
})

describe('server drift', () => {
    it('server/vendors.go holds the duplicate name text and each expense account text', () => {
        const source = serverSource('vendors.go')
        expect(source).toContain('A vendor named “%s” already exists.')
        for (const message of [
            EXPENSE_ACCOUNT_MISSING,
            EXPENSE_ACCOUNT_INACTIVE,
            EXPENSE_ACCOUNT_LEDGER,
        ]) {
            expect(source).toContain(message)
        }
    })

    it('server/customers.go holds the address text the vendor guard reuses', () => {
        expect(serverSource('customers.go')).toContain(ADDRESS_SHAPE)
    })
})
