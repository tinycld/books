import { describe, expect, it } from 'vitest'
import {
    type AdjustmentAccountRow,
    adjustmentAccountOptions,
    chartControlAccount,
    lineAssetAccounts,
} from '../tinycld/books/lib/adjustment-accounts'

// The Adjustment account (inventory-adjust spec §3.2): every active account except Accounts
// receivable, Accounts payable and the inventory asset accounts of the lines' items (an item
// with no asset account posts to the chart's Inventory asset); a new adjustment starts with
// the chart's Inventory shrinkage. The chart's control account is the server's
// (server/document_posting.go ensureControlAccount): active, the detail type, a numbered one
// first, then by number, then by id.

function account(
    row: Partial<AdjustmentAccountRow> & Pick<AdjustmentAccountRow, 'id'>
): AdjustmentAccountRow {
    return {
        number: '',
        name: '',
        type: 'expense',
        detail_type: '',
        parent: '',
        inactive: false,
        ...row,
    }
}

const SHRINK = account({
    id: 'acctadjshrnk001',
    number: '5100',
    name: 'Inventory shrinkage',
    type: 'cost_of_goods_sold',
    detail_type: 'inventory_shrinkage',
})
const SHRINK_UNNUMBERED = account({
    id: 'acctadjshrnk000',
    name: 'Shrinkage (old)',
    type: 'cost_of_goods_sold',
    detail_type: 'inventory_shrinkage',
})
const SHRINK_OFF = account({
    id: 'acctadjshrnk002',
    number: '5000',
    name: 'Shrinkage off',
    detail_type: 'inventory_shrinkage',
    inactive: true,
})
const ASSET = account({
    id: 'acctadjasset001',
    number: '1300',
    name: 'Inventory asset',
    type: 'other_current_asset',
    detail_type: 'inventory',
})
const ASSET_2 = account({
    id: 'acctadjasset002',
    number: '1310',
    name: 'Inventory asset 2',
    type: 'other_current_asset',
    detail_type: 'inventory',
})
const AR = account({
    id: 'acctadjrecv0001',
    number: '1200',
    name: 'Accounts receivable',
    type: 'accounts_receivable',
})
const AP = account({
    id: 'acctadjpay00001',
    number: '2000',
    name: 'Accounts payable',
    type: 'accounts_payable',
})
const OFF = account({ id: 'acctadjoff00001', number: '6000', name: 'Old', inactive: true })

const CHART = [SHRINK, SHRINK_UNNUMBERED, SHRINK_OFF, ASSET, ASSET_2, AR, AP, OFF]

describe('chartControlAccount', () => {
    it('takes the active account of the detail type, a numbered one first', () => {
        expect(chartControlAccount(CHART, 'inventory_shrinkage')).toBe(SHRINK.id)
        expect(chartControlAccount(CHART, 'inventory')).toBe(ASSET.id)
    })

    it('takes an unnumbered one when it is the only active one, and none without one', () => {
        expect(chartControlAccount([SHRINK_UNNUMBERED, SHRINK_OFF], 'inventory_shrinkage')).toBe(
            SHRINK_UNNUMBERED.id
        )
        expect(chartControlAccount([SHRINK_OFF, AR], 'inventory_shrinkage')).toBe('')
    })

    it('orders by id when two hold the same number', () => {
        const twin = account({ ...SHRINK, id: 'acctadjshrnk000x' })
        expect(chartControlAccount([SHRINK, twin], 'inventory_shrinkage')).toBe(twin.id)
    })
})

describe('lineAssetAccounts', () => {
    it("is each item's asset account, and the chart's Inventory asset for an item with none", () => {
        const assets = lineAssetAccounts(CHART, [
            { asset_account: ASSET_2.id },
            { asset_account: '' },
        ])
        expect([...assets].sort()).toEqual([ASSET.id, ASSET_2.id].sort())
    })

    it('is empty with no item', () => {
        expect(lineAssetAccounts(CHART, []).size).toBe(0)
    })
})

describe('adjustmentAccountOptions', () => {
    it('leaves out receivable, payable, inactive and the line asset accounts', () => {
        const { options } = adjustmentAccountOptions(CHART, '', new Set([ASSET.id]))
        const offered = options.map(option => option.value).sort()
        expect(offered).toEqual([ASSET_2.id, SHRINK.id, SHRINK_UNNUMBERED.id].sort())
    })

    it('names a stored account it does not offer', () => {
        const { triggerLabel } = adjustmentAccountOptions(CHART, OFF.id, new Set())
        expect(triggerLabel).toContain('Old')
    })
})
