import { describe, expect, it } from 'vitest'
import {
    PRODUCT_COLUMNS,
    PRODUCT_PICKER_LIMIT,
    PRODUCT_ROW_HEIGHT,
    PRODUCT_TABLE_MIN_WIDTH,
    type ProductListFields,
    productCardHeight,
    productCostText,
    productPickerOptions,
    productPriceText,
    productTypeLine,
} from '../tinycld/books/lib/product-list'
import { PRODUCT_IDS, PRODUCTS } from '../tinycld/books/lib/products-services-fixture'

type Row = (typeof PRODUCTS)[number]

function productById(id: string): Row {
    const found = PRODUCTS.find(product => product.id === id)
    if (!found) throw new Error(`no fixture product ${id}`)
    return found
}

const ACCESS_POINT = productById(PRODUCT_IDS.accessPoint)
const CONSULTATION = productById(PRODUCT_IDS.consultation)
const PAPER = productById(PRODUCT_IDS.paper)
const OFFICE_NETWORK = productById(PRODUCT_IDS.officeNetwork)

function row(seed: Pick<Row, 'id' | 'name'> & Partial<Row>): Row {
    return {
        ...ACCESS_POINT,
        sku: '',
        sales_description: '',
        purchase_description: '',
        inactive: false,
        ...seed,
    }
}

// A bundle with a stored price and cost, so only the bundle rule can blank them.
const PRICED_BUNDLE = row({
    id: 'bndlpriced00001',
    name: 'Priced bundle',
    type: 'bundle',
    price: 5000,
    cost: 2000,
    purchases: true,
})

// The server stamps `currency` on create, so an optimistic insert has none until the
// server answers.
function withoutCurrency(source: Row): Row {
    const { currency: _currency, ...rest } = source
    return rest as Row
}

describe('productPriceText', () => {
    it('formats the sales price with the row currency', () => {
        expect(productPriceText(ACCESS_POINT)).toBe('$189.00')
    })

    it('is blank for a price of 0', () => {
        expect(productPriceText(CONSULTATION)).toBe('')
    })

    it('is blank for a bundle', () => {
        expect(productPriceText(OFFICE_NETWORK)).toBe('')
        expect(productPriceText(PRICED_BUNDLE)).toBe('')
    })
})

describe('productCostText', () => {
    it('formats the cost when purchasing is on', () => {
        expect(productCostText(ACCESS_POINT)).toBe('$121.40')
    })

    it('is blank when purchasing is off, even with a stored cost', () => {
        expect(PAPER.cost).toBe(3100)
        expect(productCostText(PAPER)).toBe('')
    })

    it('is blank for a bundle', () => {
        expect(productCostText(OFFICE_NETWORK)).toBe('')
        expect(productCostText(PRICED_BUNDLE)).toBe('')
    })

    it('is blank for a cost of 0', () => {
        expect(productCostText(row({ id: 'prodzerocost001', name: 'Zero', cost: 0 }))).toBe('')
    })
})

describe('a row with no currency yet (an optimistic insert)', () => {
    const pending = withoutCurrency(ACCESS_POINT)

    it('shows the price and cost amounts without "undefined"', () => {
        expect(pending.currency).toBeUndefined()
        const price = productPriceText(pending)
        const cost = productCostText(pending)
        expect(price).not.toContain('undefined')
        expect(cost).not.toContain('undefined')
        expect(price).toContain('189.00')
        expect(cost).toContain('121.40')
    })

    it('shows the card type line without "undefined"', () => {
        expect(productTypeLine(pending)).not.toContain('undefined')
    })
})

describe('productTypeLine', () => {
    it('is the type label and the price text', () => {
        expect(productTypeLine(ACCESS_POINT)).toBe('Non-inventory · $189.00')
    })

    it('is the type label alone when the price text is blank', () => {
        expect(productTypeLine(CONSULTATION)).toBe('Service')
    })
})

describe('productCardHeight', () => {
    it('is 76 with a SKU and 60 without one at font scale 1', () => {
        expect(productCardHeight(ACCESS_POINT)).toBe(76)
        expect(productCardHeight(CONSULTATION)).toBe(60)
    })

    it('scales the text lines, not the padding', () => {
        expect(productCardHeight(ACCESS_POINT, 2)).toBe(24 + (20 + 16 + 16) * 2)
        expect(productCardHeight(ACCESS_POINT, 2)).toBe(128)
    })
})

type PickerRow = Pick<ProductListFields, 'id' | 'name' | 'sku'>

function pickerIds(rows: readonly PickerRow[], term: string) {
    return productPickerOptions(rows, term).map(option => option.id)
}

describe('productPickerOptions', () => {
    it('returns the first 50 rows, in the order given, for an empty term', () => {
        const rows: PickerRow[] = Array.from({ length: 60 }, (_, i) => ({
            id: `pickrow${String(i).padStart(8, '0')}`,
            // Names in reverse order, so a sort would change which rows come first.
            name: `Item ${String(60 - i).padStart(2, '0')}`,
            sku: `SKU-${i}`,
        }))
        expect(PRODUCT_PICKER_LIMIT).toBe(50)
        expect(productPickerOptions(rows, '')).toEqual(rows.slice(0, 50))
    })

    it('matches the SKU and the name, ignoring case', () => {
        const router = { id: 'pickrouter00001', name: 'Router', sku: 'HW-RT-1' }
        const cable = { id: 'pickcable000001', name: 'Patch CABLE, 10 ft', sku: 'NET-10' }
        const switchRow = { id: 'pickswitch00001', name: 'Switch', sku: 'hw-sw-2' }
        const service = { id: 'pickservice0001', name: 'Consulting', sku: 'SVC-1' }
        const rows = [router, cable, switchRow, service]
        expect(pickerIds(rows, 'hw-')).toEqual([router.id, switchRow.id])
        expect(pickerIds(rows, 'cable')).toEqual([cable.id])
    })

    it('does not throw on a row whose sku is missing at run time', () => {
        // The row type says sku is a string, but a row can arrive without it.
        const missing = { id: 'picknosku000001', name: 'No SKU here' } as PickerRow
        expect(() => productPickerOptions([missing], 'zzz')).not.toThrow()
        expect(pickerIds([missing], 'zzz')).toEqual([])
        expect(pickerIds([missing], 'no sku')).toEqual([missing.id])
    })
})

describe('table layout constants', () => {
    it('has a 560 px minimum width and 56 px rows', () => {
        expect(PRODUCT_TABLE_MIN_WIDTH).toBe(560)
        expect(PRODUCT_ROW_HEIGHT).toBe(56)
    })

    it('has the decided column styles', () => {
        expect(PRODUCT_COLUMNS).toEqual({
            name: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 148 },
            type: { width: 120, flexShrink: 0 },
            price: { width: 112, flexShrink: 0 },
            cost: { width: 112, flexShrink: 0 },
            menu: { width: 44, flexShrink: 0 },
        })
    })
})
