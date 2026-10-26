import { describe, expect, it } from 'vitest'
import {
    CUSTOMER_COLUMNS,
    CUSTOMERS_TABLE_MIN_WIDTH,
    companyLine,
    customerCardHeight,
    customerLabel,
} from '../tinycld/books/lib/customer-display'
import type { TreeCustomer } from '../tinycld/books/lib/customer-tree'

function customer(seed: Partial<TreeCustomer>): TreeCustomer {
    return {
        id: 'c1',
        display_name: 'Harborview Kitchen',
        company: '',
        email: '',
        phone: '',
        parent: '',
        inactive: false,
        ...seed,
    }
}

describe('companyLine', () => {
    it('is the company when it differs from the display name', () => {
        expect(
            companyLine({
                display_name: 'Harborview Hospitality Group',
                company: 'Harborview Hospitality Group LLC',
            })
        ).toBe('Harborview Hospitality Group LLC')
    })

    it('is empty when the company equals the display name', () => {
        expect(companyLine({ display_name: 'Fox Hollow', company: 'Fox Hollow' })).toBe('')
    })

    it('is empty when there is no company', () => {
        expect(companyLine({ display_name: 'Wei Chen', company: '' })).toBe('')
    })

    it('is empty when the row has no company field', () => {
        const row: Partial<TreeCustomer> = { display_name: 'Wei Chen' }
        expect(companyLine(row as TreeCustomer)).toBe('')
    })
})

describe('customerLabel', () => {
    it('joins the parent and the child with " : "', () => {
        expect(customerLabel({ display_name: 'Kitchen' }, { display_name: 'Harborview' })).toBe(
            'Harborview : Kitchen'
        )
    })

    it('is the display name without a parent', () => {
        expect(customerLabel({ display_name: 'Kitchen' })).toBe('Kitchen')
    })
})

describe('customerCardHeight', () => {
    const bare = customerCardHeight(customer({}))
    const withCompany = customerCardHeight(customer({ company: 'Harborview Hospitality LLC' }))
    const withEmail = customerCardHeight(customer({ email: 'kitchen@harborview.example' }))
    const withPhone = customerCardHeight(customer({ phone: '(206) 555-0143' }))
    const withAll = customerCardHeight(
        customer({
            company: 'Harborview Hospitality LLC',
            email: 'kitchen@harborview.example',
            phone: '(206) 555-0143',
        })
    )

    it('is 44 px for a name-only card and 92 px with three muted lines at scale 1', () => {
        expect(bare).toBe(44)
        expect(customerCardHeight(customer({}), 1)).toBe(44)
        expect(withAll).toBe(92)
    })

    it('keeps a name-only card at scale 1 at least the 44 px touch target', () => {
        expect(customerCardHeight(customer({}), 1)).toBeGreaterThanOrEqual(44)
    })

    it('grows by the same one muted line for each of company, email and phone', () => {
        const line = withCompany - bare
        expect(line).toBeGreaterThan(0)
        expect(withEmail - bare).toBe(line)
        expect(withPhone - bare).toBe(line)
        expect(withAll - bare).toBe(3 * line)
    })

    it('scales the muted lines with the font scale', () => {
        const linePart = (scale: number) =>
            customerCardHeight(
                customer({
                    company: 'Harborview Hospitality LLC',
                    email: 'kitchen@harborview.example',
                    phone: '(206) 555-0143',
                }),
                scale
            ) - customerCardHeight(customer({}), scale)
        expect(customerCardHeight(customer({ email: 'kitchen@harborview.example' }), 1)).toBe(
            withEmail
        )
        expect(linePart(1)).toBe(withAll - bare)
        expect(
            customerCardHeight(customer({ email: 'kitchen@harborview.example' }), 1.5)
        ).toBeGreaterThan(withEmail)
        expect(linePart(1.5)).toBe(1.5 * linePart(1))
    })

    // Height is fixed padding plus lines that all scale, so it is linear in the scale:
    // padding = 2·h(1) − h(2), read from the function itself, not from its constants.
    it('scales the name line and the muted lines, not the padding', () => {
        const full = customer({
            company: 'Harborview Hospitality LLC',
            email: 'kitchen@harborview.example',
            phone: '(206) 555-0143',
        })
        const height = (c: TreeCustomer, scale: number) => customerCardHeight(c, scale)
        const padding = (c: TreeCustomer) => 2 * height(c, 1) - height(c, 2)

        expect(height(customer({}), 1.5)).toBeGreaterThan(height(customer({}), 1))
        expect(padding(full)).toBeCloseTo(padding(customer({})), 6)
        expect(padding(customer({}))).toBeGreaterThanOrEqual(0)
        for (const c of [customer({}), full]) {
            const growth = height(c, 1.5) - height(c, 1)
            expect(growth).toBeGreaterThan(0)
            expect(growth).toBeCloseTo(0.5 * (height(c, 1) - padding(c)), 6)
            expect(growth).toBeCloseTo(height(c, 2) - height(c, 1.5), 6)
        }
        expect(height(full, 1.5) - height(full, 1)).toBeGreaterThan(
            height(customer({}), 1.5) - height(customer({}), 1)
        )
    })

    it('draws no line for a missing email or phone', () => {
        const row: Partial<TreeCustomer> = {
            id: 'c1',
            display_name: 'Harborview Kitchen',
            parent: '',
            inactive: false,
        }
        const sparse = row as TreeCustomer
        expect(customerCardHeight(sparse)).toBe(bare)
        expect(customerCardHeight(sparse, 1.5)).toBe(customerCardHeight(customer({}), 1.5))
    })

    it('adds no line for a company equal to the display name', () => {
        expect(customerCardHeight(customer({ company: 'Harborview Kitchen' }))).toBe(bare)
    })
})

describe('table columns', () => {
    it('shares the column sizes between header and rows, with a 540 px table', () => {
        expect(CUSTOMERS_TABLE_MIN_WIDTH).toBe(540)
        expect(CUSTOMER_COLUMNS.name).toEqual({
            flexGrow: 3,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 180,
        })
        expect(CUSTOMER_COLUMNS.email).toEqual({
            flexGrow: 2,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 140,
        })
        expect(CUSTOMER_COLUMNS.phone).toEqual({ width: 150, flexShrink: 0 })
        expect(CUSTOMER_COLUMNS.menu).toEqual({ width: 44, flexShrink: 0 })
    })
})
