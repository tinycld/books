import { describe, expect, it } from 'vitest'
import {
    defaultRefundAccount,
    isRefundAccountRow,
    refundAccountOptions,
} from '../tinycld/books/lib/refund-accounts'
import type { RefundAccountRow } from '../tinycld/books/lib/vendor-refund-fixture'

// Refunded to (vendor refund spec §3.3, Q3): the active bank and credit card accounts and
// the active Undeposited funds accounts, in chart order, "<number> <name>", indented by
// depth; a stored inactive account is named only for the value the form mounted with. The
// default is the first active bank account, else the first listed account, else ''.

function account(row: Partial<RefundAccountRow> & Pick<RefundAccountRow, 'id'>): RefundAccountRow {
    return {
        number: '',
        name: '',
        type: 'bank',
        detail_type: 'checking',
        parent: '',
        inactive: false,
        ...row,
    }
}

const CHECKING = account({ id: 'acctrfcheck0001', number: '1000', name: 'Business Checking' })
// A sub-account of Business Checking: listed under it, one level in.
const PAYROLL = account({
    id: 'acctrfpayrl0001',
    number: '1005',
    name: 'Payroll Checking',
    parent: CHECKING.id,
})
const SAVINGS = account({
    id: 'acctrfsavng0001',
    number: '1010',
    name: 'Business Savings',
    detail_type: 'savings',
})
const UNDEPOSITED = account({
    id: 'acctrfundep0001',
    number: '1200',
    name: 'Undeposited funds',
    type: 'other_current_asset',
    detail_type: 'undeposited_funds',
})
const CARD = account({
    id: 'acctrfcard00001',
    number: '2100',
    name: 'Company Card',
    type: 'credit_card',
    detail_type: 'credit_card',
})
// Not where a refund arrives: inactive, or of another type.
const OLD_BANK = account({
    id: 'acctrfoldbk0001',
    number: '1020',
    name: 'Old Checking',
    inactive: true,
})
const OLD_CARD = account({
    id: 'acctrfoldcd0001',
    number: '2110',
    name: 'Old Card',
    type: 'credit_card',
    detail_type: 'credit_card',
    inactive: true,
})
const OTHER_ASSET = account({
    id: 'acctrfprepd0001',
    number: '1300',
    name: 'Prepaid expenses',
    type: 'other_current_asset',
    detail_type: 'prepaid_expenses',
})
const INCOME = account({
    id: 'acctrfincom0001',
    number: '4000',
    name: 'Consulting Income',
    type: 'income',
    detail_type: 'service_income',
})

// Given out of chart order, so the options' order comes from the chart, not the input.
const CHART = [
    INCOME,
    CARD,
    OLD_CARD,
    UNDEPOSITED,
    OTHER_ASSET,
    OLD_BANK,
    SAVINGS,
    PAYROLL,
    CHECKING,
]

describe('refundAccountOptions', () => {
    it('lists the active bank, credit card and Undeposited funds accounts in chart order, as "<number> <name>"', () => {
        const { options } = refundAccountOptions(CHART, '')
        expect(options.map(option => option.label)).toEqual([
            '1000 Business Checking',
            '1005 Payroll Checking',
            '1010 Business Savings',
            '1200 Undeposited funds',
            '2100 Company Card',
        ])
        expect(options.map(option => option.value)).toEqual([
            CHECKING.id,
            PAYROLL.id,
            SAVINGS.id,
            UNDEPOSITED.id,
            CARD.id,
        ])
    })

    it('indents a sub-account by its depth, not by leading spaces', () => {
        const { options } = refundAccountOptions(CHART, '')
        const indents = Object.fromEntries(options.map(option => [option.value, option.indent]))
        expect(indents[CHECKING.id]).toBe(0)
        expect(indents[PAYROLL.id]).toBe(1)
        expect(indents[CARD.id]).toBe(0)
        expect(options.every(option => option.label === option.label.trim())).toBe(true)
    })

    it('offers no inactive account, no other asset and no income account', () => {
        const values = refundAccountOptions(CHART, '').options.map(option => option.value)
        for (const row of [OLD_BANK, OLD_CARD, OTHER_ASSET, INCOME]) {
            expect(values).not.toContain(row.id)
        }
    })

    it('names a stored inactive account only when it is the mounted value', () => {
        const mounted = refundAccountOptions(CHART, OLD_BANK.id)
        expect(mounted.triggerLabel).toBe('1020 Old Checking')
        expect(mounted.options.map(option => option.value)).not.toContain(OLD_BANK.id)
        // Mounted with another value, the inactive account is named nowhere.
        const other = refundAccountOptions(CHART, CHECKING.id)
        expect(other.triggerLabel).toBe('')
        expect(other.options.map(option => option.label).join(' ')).not.toContain('Old Checking')
        expect(refundAccountOptions(CHART, '').triggerLabel).toBe('')
    })
})

describe('isRefundAccountRow', () => {
    it('is true for an active bank, credit card or Undeposited funds account only', () => {
        for (const row of [CHECKING, PAYROLL, SAVINGS, UNDEPOSITED, CARD]) {
            expect(isRefundAccountRow(row), row.name).toBe(true)
        }
        for (const row of [OLD_BANK, OLD_CARD, OTHER_ASSET, INCOME]) {
            expect(isRefundAccountRow(row), row.name).toBe(false)
        }
    })
})

describe('defaultRefundAccount', () => {
    it('is the first active bank account in chart order', () => {
        expect(defaultRefundAccount(CHART)).toBe(CHECKING.id)
    })

    it('skips an inactive bank account', () => {
        const noChecking = CHART.filter(row => row.id !== CHECKING.id && row.id !== PAYROLL.id)
        expect(defaultRefundAccount(noChecking)).toBe(SAVINGS.id)
        expect(defaultRefundAccount([OLD_BANK, SAVINGS])).toBe(SAVINGS.id)
    })

    it('is the first listed account when the chart has no active bank account', () => {
        expect(defaultRefundAccount([CARD, OLD_BANK, UNDEPOSITED, INCOME])).toBe(UNDEPOSITED.id)
        expect(defaultRefundAccount([CARD, INCOME])).toBe(CARD.id)
    })

    it('is empty when the chart lists no refund account', () => {
        expect(defaultRefundAccount([INCOME, OTHER_ASSET, OLD_BANK])).toBe('')
        expect(defaultRefundAccount([])).toBe('')
    })
})
