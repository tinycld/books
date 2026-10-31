import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    accountUsedByProductsMessage,
    BUNDLE_DELETE_NOTE,
    BUNDLE_HAS_NO_OWN,
    BUNDLE_ITEM_LIMIT,
    BUNDLE_KEEPS_TYPE,
    BUNDLE_ONLY_NEW,
    BUNDLE_TYPE_FIXED,
    bundlePartialMessage,
    CHOOSER_READ_ONLY,
    duplicateProductNameMessage,
    EXPENSE_ACCOUNT_REQUIRED,
    INCOME_ACCOUNT_INACTIVE,
    INCOME_ACCOUNT_MISSING,
    INCOME_ACCOUNT_REQUIRED,
    INCOME_ACCOUNT_TYPE,
    ITEM_IS_BUNDLE,
    ITEM_NEEDS_BUNDLE,
    ITEM_PRODUCT_MISSING,
    ITEM_QUANTITY,
    ITEM_STAYS_IN_BUNDLE,
    inactiveItemMessage,
    MONEY_MALFORMED,
    MONEY_NEGATIVE,
    MONEY_TOO_LARGE,
    PRODUCT_DISCARD_MESSAGE,
    PRODUCT_EXPENSE_ACCOUNT_LEDGER,
    PRODUCT_LOAD_ERROR,
    PRODUCT_NOT_FOUND,
    PRODUCT_NOT_SAVED,
    PRODUCT_SAVE_FAILED,
    PRODUCT_SAVE_TEXTS,
    productOnBundlesMessage,
    UNSAVED_PRODUCT_DELETE_WARNING,
} from '../tinycld/books/lib/product-messages'

// Read inside the test, so a missing server file fails the drift test only.
function serverSource(file: string) {
    return readFileSync(join(__dirname, '..', 'server', file), 'utf8')
}

const DUPLICATE_NAME = 'A product or service named “%s” already exists.'
const ITEM_INACTIVE = '“%s” is inactive.'
const ON_ONE_BUNDLE = 'This item is in 1 bundle. Take it out of it first, or make it inactive.'
const ON_BUNDLES = 'This item is in %d bundles. Take it out of them first, or make it inactive.'
const ACCOUNT_ONE_PRODUCT =
    'This account is used by 1 product or service and cannot be deleted. Make it inactive instead.'
const ACCOUNT_PRODUCTS =
    'This account is used by %d products and services and cannot be deleted. Make it inactive instead.'

describe('client copies', () => {
    it('are the server texts of the plan Decisions', () => {
        expect(BUNDLE_TYPE_FIXED).toBe('A bundle cannot change type.')
        expect(BUNDLE_ONLY_NEW).toBe('Only a new product can be a bundle.')
        expect(INCOME_ACCOUNT_REQUIRED).toBe('Choose an income account.')
        expect(INCOME_ACCOUNT_MISSING).toBe('The income account does not exist.')
        expect(INCOME_ACCOUNT_INACTIVE).toBe('The income account is inactive.')
        expect(INCOME_ACCOUNT_TYPE).toBe(
            'The income account must be an Income or Other income account.'
        )
        expect(EXPENSE_ACCOUNT_REQUIRED).toBe('Choose an expense account.')
        expect(PRODUCT_EXPENSE_ACCOUNT_LEDGER).toBe(
            "A product's expense account cannot be Accounts receivable or Accounts payable."
        )
        expect(BUNDLE_HAS_NO_OWN).toBe('A bundle has no price, cost or accounts of its own.')
        expect(ITEM_NEEDS_BUNDLE).toBe('Items belong to a bundle.')
        expect(ITEM_STAYS_IN_BUNDLE).toBe('An item stays in its bundle.')
        expect(ITEM_PRODUCT_MISSING).toBe('The product or service does not exist.')
        expect(ITEM_IS_BUNDLE).toBe('A bundle cannot contain another bundle.')
        expect(ITEM_QUANTITY).toBe('Enter a quantity above 0 with at most 2 decimals.')
        expect(BUNDLE_ITEM_LIMIT).toBe('A bundle holds at most 50 items.')
    })

    it('are the client-only texts of the plan Decisions', () => {
        expect(PRODUCT_NOT_SAVED).toBe('The product was not saved.')
        expect(PRODUCT_SAVE_FAILED).toBe('Books could not save this product.')
        expect(UNSAVED_PRODUCT_DELETE_WARNING).toBe('Unsaved changes to this product will be lost.')
        expect(PRODUCT_DISCARD_MESSAGE).toBe('This product has changes that are not saved.')
        expect(PRODUCT_LOAD_ERROR).toBe('Could not load products and services')
        expect(PRODUCT_NOT_FOUND).toBe("This product or service doesn't exist or was removed")
        expect(BUNDLE_KEEPS_TYPE).toBe('A bundle keeps its type.')
        expect(CHOOSER_READ_ONLY).toBe('You can view products but not add them.')
        expect(BUNDLE_DELETE_NOTE).toBe('Its item list is deleted with it.')
        expect(MONEY_MALFORMED).toBe('Enter an amount such as 1,250.00')
        expect(MONEY_NEGATIVE).toBe('Enter an amount of 0 or more')
        expect(MONEY_TOO_LARGE).toBe('Too large')
    })

    it('PRODUCT_SAVE_TEXTS puts each save text in its slot', () => {
        expect(PRODUCT_SAVE_TEXTS).toEqual({
            logContext: 'books.products',
            notSavedTitle: 'The product was not saved.',
            clientSaveFailed: 'Books could not save this product.',
        })
    })
})

describe('messages with a value', () => {
    it('duplicateProductNameMessage names the duplicate', () => {
        expect(duplicateProductNameMessage('Acme')).toBe(
            'A product or service named “Acme” already exists.'
        )
    })

    it('inactiveItemMessage names the inactive product', () => {
        expect(inactiveItemMessage('Cable ties')).toBe('“Cable ties” is inactive.')
    })

    it('productOnBundlesMessage is singular for one bundle', () => {
        expect(productOnBundlesMessage(1)).toBe(
            'This item is in 1 bundle. Take it out of it first, or make it inactive.'
        )
        expect(productOnBundlesMessage(2)).toBe(
            'This item is in 2 bundles. Take it out of them first, or make it inactive.'
        )
    })

    it('accountUsedByProductsMessage is singular for one product', () => {
        expect(accountUsedByProductsMessage(1)).toBe(
            'This account is used by 1 product or service and cannot be deleted. Make it inactive instead.'
        )
        expect(accountUsedByProductsMessage(3)).toBe(
            'This account is used by 3 products and services and cannot be deleted. Make it inactive instead.'
        )
    })

    it('bundlePartialMessage puts the refusal after the saved bundle', () => {
        expect(bundlePartialMessage('A bundle holds at most 50 items.')).toBe(
            'The bundle was saved, but an item was not: A bundle holds at most 50 items.'
        )
    })
})

describe('server drift', () => {
    it('server/products.go holds each product and bundle item text', () => {
        const source = serverSource('products.go')
        for (const message of [
            BUNDLE_TYPE_FIXED,
            BUNDLE_ONLY_NEW,
            INCOME_ACCOUNT_REQUIRED,
            INCOME_ACCOUNT_MISSING,
            INCOME_ACCOUNT_INACTIVE,
            INCOME_ACCOUNT_TYPE,
            EXPENSE_ACCOUNT_REQUIRED,
            PRODUCT_EXPENSE_ACCOUNT_LEDGER,
            BUNDLE_HAS_NO_OWN,
            ITEM_NEEDS_BUNDLE,
            ITEM_STAYS_IN_BUNDLE,
            ITEM_PRODUCT_MISSING,
            ITEM_IS_BUNDLE,
            ITEM_QUANTITY,
            BUNDLE_ITEM_LIMIT,
            DUPLICATE_NAME,
            ITEM_INACTIVE,
            ON_ONE_BUNDLE,
            ON_BUNDLES,
        ]) {
            expect(source).toContain(message)
        }
    })

    it('server/accounts.go holds both account delete texts', () => {
        const source = serverSource('accounts.go')
        expect(source).toContain(ACCOUNT_ONE_PRODUCT)
        expect(source).toContain(ACCOUNT_PRODUCTS)
    })

    it('each server text with a value reads as its client copy', () => {
        expect(DUPLICATE_NAME.replace('%s', 'Acme')).toBe(duplicateProductNameMessage('Acme'))
        expect(ITEM_INACTIVE.replace('%s', 'Cable ties')).toBe(inactiveItemMessage('Cable ties'))
        expect(ON_ONE_BUNDLE).toBe(productOnBundlesMessage(1))
        expect(ON_BUNDLES.replace('%d', '4')).toBe(productOnBundlesMessage(4))
        expect(ACCOUNT_ONE_PRODUCT).toBe(accountUsedByProductsMessage(1))
        expect(ACCOUNT_PRODUCTS.replace('%d', '7')).toBe(accountUsedByProductsMessage(7))
    })
})
