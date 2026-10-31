import { describe, expect, it } from 'vitest'
import { CUSTOMER_IDS, CUSTOMERS } from '../tinycld/books/lib/customer-form-fixture'
import {
    customerTreeRows,
    pickerOptions,
    type TreeCustomer,
    usableParentId,
} from '../tinycld/books/lib/customer-tree'

function treeCustomer(seed: Pick<TreeCustomer, 'id' | 'display_name'> & Partial<TreeCustomer>) {
    return { company: '', email: '', phone: '', parent: '', inactive: false, ...seed }
}

describe('pickerOptions', () => {
    const named = (id: string, display_name: string) => ({ id, display_name })
    const optionNames = (rows: { display_name: string }[]) => rows.map(r => r.display_name)

    it('matches the display name, ignoring case', () => {
        const options = pickerOptions(CUSTOMERS, { term: 'northwind', selfId: '' })
        expect(optionNames(options)).toContain('Northwind Traders')
        expect(optionNames(options)).not.toContain('Aspen Ridge Dental')
        expect(options.every(r => r.display_name.toLowerCase().includes('northwind'))).toBe(true)
    })

    it('leaves out the customer being edited', () => {
        const options = pickerOptions(CUSTOMERS, { term: '', selfId: CUSTOMER_IDS.northwind })
        expect(options.map(r => r.id)).not.toContain(CUSTOMER_IDS.northwind)
        expect(optionNames(options)).toContain('Aspen Ridge Dental')
    })

    it('treats % and _ as literal characters, not wildcards', () => {
        const rows = [
            named('p1', 'Acme 100% Juice'),
            named('u1', 'North_West Supply'),
            named('n1', 'Northwest Supply'),
            named('b1', 'Bluefin Marine Supply'),
        ]
        expect(optionNames(pickerOptions(rows, { term: '%', selfId: '' }))).toEqual([
            'Acme 100% Juice',
        ])
        expect(optionNames(pickerOptions(rows, { term: '100%', selfId: '' }))).toEqual([
            'Acme 100% Juice',
        ])
        expect(optionNames(pickerOptions(rows, { term: 'north_west', selfId: '' }))).toEqual([
            'North_West Supply',
        ])
    })

    it('keeps the first 50 of 60 matches, in the order given', () => {
        const rows = Array.from({ length: 60 }, (_, i) =>
            named(`m${i}`, `Match ${String(i).padStart(2, '0')}`)
        )
        expect(pickerOptions(rows, { term: 'match', selfId: '' })).toEqual(rows.slice(0, 50))
    })
})

describe('usableParentId', () => {
    const candidate = (seed: Partial<{ id: string; parent: string; inactive: boolean }>) => ({
        id: 'top1',
        parent: '',
        inactive: false,
        ...seed,
    })

    it('is the id of an active top-level customer', () => {
        expect(usableParentId(candidate({ id: CUSTOMER_IDS.northwind }))).toBe(
            CUSTOMER_IDS.northwind
        )
    })

    it('is empty for no customer, an inactive customer and a sub-customer', () => {
        expect(usableParentId(undefined)).toBe('')
        expect(usableParentId(candidate({ inactive: true }))).toBe('')
        expect(usableParentId(candidate({ parent: CUSTOMER_IDS.northwind }))).toBe('')
    })
})

describe('customerTreeRows', () => {
    const alder = treeCustomer({ id: 'alder', display_name: 'Alder' })
    const annex = treeCustomer({ id: 'annex', display_name: 'Annex', parent: 'alder' })
    const barn = treeCustomer({ id: 'barn', display_name: 'Barn', parent: 'alder' })
    const birch = treeCustomer({ id: 'birch', display_name: 'Birch' })
    const loaded = (c: TreeCustomer, parentRow?: TreeCustomer) => ({ ...c, parentRow })
    const shape = (rows: ReturnType<typeof customerTreeRows<TreeCustomer>>) =>
        rows.map(row => [row.party.id, row.depth])

    it("keeps the server's order and indents each sub-customer under the parent above it", () => {
        const rows = customerTreeRows([
            loaded(alder),
            loaded(annex, alder),
            loaded(barn, alder),
            loaded(birch),
        ])
        expect(shape(rows)).toEqual([
            ['alder', 0],
            ['annex', 1],
            ['barn', 1],
            ['birch', 0],
        ])
    })

    it("shows a matching sub-customer's parent above it, once", () => {
        const rows = customerTreeRows([loaded(annex, alder), loaded(barn, alder), loaded(birch)])
        expect(shape(rows)).toEqual([
            ['alder', 0],
            ['annex', 1],
            ['barn', 1],
            ['birch', 0],
        ])
    })

    it('does not repeat a parent that matched itself', () => {
        expect(shape(customerTreeRows([loaded(alder), loaded(annex, alder)]))).toEqual([
            ['alder', 0],
            ['annex', 1],
        ])
    })

    it('shows a sub-customer whose parent has not loaded as a top-level row', () => {
        expect(shape(customerTreeRows([loaded(annex)]))).toEqual([['annex', 0]])
    })

    // A new sub-customer has no sort_key until the server answers, so it sorts first.
    it('shows the parent once when an unsaved sub-customer sorts before it', () => {
        const added = treeCustomer({ id: 'added', display_name: 'Added', parent: 'alder' })
        const rows = customerTreeRows([
            loaded(added, alder),
            loaded(alder),
            loaded(annex, alder),
            loaded(birch),
        ])
        expect(shape(rows)).toEqual([
            ['alder', 0],
            ['added', 1],
            ['annex', 1],
            ['birch', 0],
        ])
    })

    // A renamed parent's new sort_key can land before its sub-customers are re-keyed.
    it('shows the parent once when it sorts after its own sub-customers', () => {
        const rows = customerTreeRows([
            loaded(annex, alder),
            loaded(barn, alder),
            loaded(birch),
            loaded(alder),
        ])
        expect(shape(rows)).toEqual([
            ['alder', 0],
            ['annex', 1],
            ['barn', 1],
            ['birch', 0],
        ])
    })

    it('gives every row its own id', () => {
        const rows = customerTreeRows([loaded(annex, alder), loaded(birch), loaded(alder)])
        const ids = rows.map(row => row.party.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
