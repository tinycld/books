import { describe, expect, it } from 'vitest'
import {
    DEPOSIT_ACCOUNT_IDS,
    DEPOSIT_ACCOUNTS,
    NO_DEPOSIT_ACCOUNTS,
} from '../tinycld/books/lib/sales-receipt-form-fixture'
import {
    defaultMessageReadOnlyText,
    depositShown,
    salesDepositReadOnlyText,
    salesDepositSettingOptions,
} from '../tinycld/books/lib/sales-settings'

// Settings → Sales (spec §3.11) and the receipt form's Deposit to, which is drawn only
// while "Sales deposited to" is "Ask".

describe('depositShown', () => {
    // The receipt form re-renders when the live settings row changes and reads this on
    // every render, so Deposit to appears or hides at once.
    it('is true with "Ask"', () => {
        expect(depositShown({ sales_deposit_account: '' })).toBe(true)
    })

    it('is false with an account set', () => {
        expect(depositShown({ sales_deposit_account: DEPOSIT_ACCOUNT_IDS.undeposited })).toBe(false)
    })
})

describe('salesDepositSettingOptions', () => {
    it('offers Ask first, then every active deposit account in chart order', () => {
        const { options } = salesDepositSettingOptions(DEPOSIT_ACCOUNTS, '')
        expect(options.map(option => option.label)).toEqual([
            'Ask',
            '1000 Business Checking',
            '1010 Business Savings',
            '1200 Undeposited funds',
        ])
        expect(options.map(option => option.value)).toEqual([
            '',
            DEPOSIT_ACCOUNT_IDS.checking,
            DEPOSIT_ACCOUNT_IDS.savings,
            DEPOSIT_ACCOUNT_IDS.undeposited,
        ])
    })

    it('offers only Ask when the chart has no deposit account', () => {
        const { options } = salesDepositSettingOptions(NO_DEPOSIT_ACCOUNTS, '')
        expect(options.map(option => option.label)).toEqual(['Ask'])
        expect(options.map(option => option.value)).toEqual([''])
    })
})

describe('salesDepositReadOnlyText', () => {
    it('is Ask with no account set', () => {
        expect(salesDepositReadOnlyText('', DEPOSIT_ACCOUNTS)).toBe('Ask')
    })

    it('is "<number> <name>" of the set account', () => {
        expect(salesDepositReadOnlyText(DEPOSIT_ACCOUNT_IDS.undeposited, DEPOSIT_ACCOUNTS)).toBe(
            '1200 Undeposited funds'
        )
    })
})

describe('defaultMessageReadOnlyText', () => {
    it('is None for an empty message', () => {
        expect(defaultMessageReadOnlyText('')).toBe('None')
    })

    it('is the message itself otherwise', () => {
        expect(defaultMessageReadOnlyText('Thank you for your business!')).toBe(
            'Thank you for your business!'
        )
    })
})
