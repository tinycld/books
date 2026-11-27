import { defaultDefinitionFor, hostDefSchema } from '@tinycld/core/lib/forms/host'
import { describe, expect, it, vi } from 'vitest'
import hosts from '../tinycld/books/forms/hosts'
import type { DocumentStart } from '../tinycld/books/hooks/document-data'
import { shownLineTablesOf } from '../tinycld/books/hooks/useDocumentForm'
import { COMPANY_SETTINGS, EMPTY_SETTINGS } from '../tinycld/books/lib/books-settings-fixture'
import { hideBuiltins } from '../tinycld/books/lib/form-definition'
import type { PurchaseLines } from '../tinycld/books/lib/purchase-lines'
import { PURCHASE_ORDER_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { SHIP_TO_MAX_LENGTH, shipToStartOf } from '../tinycld/books/lib/ship-to'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { useStoreStub } = await import('./accounts-form-harness')
    return { useStore: useStoreStub }
})
vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// A purchase order's line tables follow the bill's rule (purchase order spec §3.4, Q13):
// the "Bill lines" setting (Settings → Purchases) decides which tables a new order shows,
// and a table also shows when the order already has a line of it. A table the form does
// not show is marked hidden in the rendered definition, so it has no Tab stop. And a new
// order's Ship to starts with the business name and the address of Settings → Company
// (spec §3.3, Q8).

function orderStart(purchaseLines: PurchaseLines): DocumentStart {
    return { kind: 'purchase_order', purchaseLines }
}

const NO_LINE = { account_lines: [], item_lines: [] }
const ACCOUNT_LINE = { account_lines: [{ kind: 'account' }], item_lines: [] }
const PRODUCT_LINE = { account_lines: [], item_lines: [{ kind: 'item' }] }

describe('the line tables a purchase order shows', () => {
    it.each([
        ['both', NO_LINE, ['account_lines', 'item_lines']],
        ['both', ACCOUNT_LINE, ['account_lines', 'item_lines']],
        ['both', PRODUCT_LINE, ['account_lines', 'item_lines']],
        ['accounts', NO_LINE, ['account_lines']],
        ['accounts', ACCOUNT_LINE, ['account_lines']],
        ['accounts', PRODUCT_LINE, ['account_lines', 'item_lines']],
        ['products', NO_LINE, ['item_lines']],
        ['products', ACCOUNT_LINE, ['account_lines', 'item_lines']],
        ['products', PRODUCT_LINE, ['item_lines']],
    ] as const)('under "%s" with lines %o shows %o', (setting, rows, shown) => {
        expect(shownLineTablesOf(PURCHASE_ORDER_KIND, orderStart(setting), rows)).toEqual(shown)
    })

    // A hidden field gets no Tab stop (core lib/forms/logic.ts: `visible: !f.hidden`).
    it.each([
        ['both', [], ['account_lines', 'item_lines']],
        ['accounts', ['item_lines'], ['account_lines']],
        ['products', ['account_lines'], ['item_lines']],
    ] as const)('under "%s" marks %o hidden in the rendered definition and keeps %o shown', (setting, hiddenKeys, shownKeys) => {
        const raw = hosts.find(host => host.key === PURCHASE_ORDER_KIND.hostKey)
        if (!raw) throw new Error('no purchase order host in forms/hosts.ts')
        const host = hostDefSchema.parse(raw)
        const shown = shownLineTablesOf(PURCHASE_ORDER_KIND, orderStart(setting), NO_LINE)
        const hidden = PURCHASE_ORDER_KIND.lineTables
            .map(table => table.key)
            .filter(key => !shown.includes(key))
        expect(hidden).toEqual(hiddenKeys)
        const fields = hideBuiltins(defaultDefinitionFor(host), hidden, host).fields
        const hiddenOf = (key: string) => {
            const field = fields.find(f => f.key === key)
            if (!field) throw new Error(`no ${key} field in the purchase order definition`)
            return field.hidden === true
        }
        for (const key of hiddenKeys) expect(hiddenOf(key)).toBe(true)
        for (const key of shownKeys) expect(hiddenOf(key)).toBe(false)
    })
})

describe('shipToStartOf', () => {
    it('puts the business name, then each line of the company address, one per line', () => {
        expect(shipToStartOf(COMPANY_SETTINGS)).toBe(
            'Hartwell Supply Co.\n3540 E Broad St, Suite 210\nMansfield, TX 76063'
        )
    })

    it('is the business name alone when the company has no address', () => {
        expect(shipToStartOf({ ...COMPANY_SETTINGS, address: '' })).toBe('Hartwell Supply Co.')
    })

    it('is empty for a book with no name and no address', () => {
        expect(shipToStartOf({ ...EMPTY_SETTINGS, business_name: '', address: '' })).toBe('')
    })

    it('writes a Windows line break of the address as one line break', () => {
        expect(
            shipToStartOf({
                ...COMPANY_SETTINGS,
                business_name: 'Acme',
                address: '1 Main St\r\nSpringfield',
            })
        ).toBe('Acme\n1 Main St\nSpringfield')
    })

    it('is cut at 500 characters', () => {
        const address = 'x'.repeat(600)
        const text = shipToStartOf({ ...COMPANY_SETTINGS, business_name: 'Acme', address })
        expect(SHIP_TO_MAX_LENGTH).toBe(500)
        expect(text).toHaveLength(500)
        expect(text).toBe(`Acme\n${'x'.repeat(495)}`)
    })
})
