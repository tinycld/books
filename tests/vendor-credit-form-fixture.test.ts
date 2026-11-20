import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { APPLY_CREDIT_MESSAGES, appliedToastText } from '../tinycld/books/lib/apply-credit-schema'
import { BILLS } from '../tinycld/books/lib/bill-form-fixture'
import { VENDOR_CREDIT_APPLICATION } from '../tinycld/books/lib/credit-application-kinds'
import { VENDOR_CREDIT_MESSAGES, VENDOR_CREDIT_REF_HINT } from '../tinycld/books/lib/document-texts'
import { PAY_BILLS_BILLS, PAY_BILLS_SEED_BILLS } from '../tinycld/books/lib/pay-bills-fixture'
import { fillPaymentText } from '../tinycld/books/lib/payment-texts'
import { PRODUCTS } from '../tinycld/books/lib/products-services-fixture'
import { PURCHASE_ACCOUNT_TYPES } from '../tinycld/books/lib/purchase-line-columns'
import { documentConflictText } from '../tinycld/books/lib/revision'
import { VENDOR_CREDIT_KIND } from '../tinycld/books/lib/sales-document-kinds'
import { SEED_ACCOUNTS } from '../tinycld/books/lib/seed-accounts'
import {
    APPLY_CREDIT_TEXTS,
    VENDOR_CREDIT_APPLICATIONS,
    VENDOR_CREDIT_IDS,
    VENDOR_CREDIT_LINES,
    VENDOR_CREDIT_SEED_APPLICATION_IDS,
    VENDOR_CREDIT_SEED_BILL,
    VENDOR_CREDIT_SEED_IDS,
    VENDOR_CREDIT_TEXTS,
    VENDOR_CREDITS,
    type VendorCreditApplicationRecord,
    type VendorCreditLineFixtureRecord,
    type VendorCreditLineRecord,
    type VendorCreditRecord,
} from '../tinycld/books/lib/vendor-credit-form-fixture'
import type {
    BooksVendorCreditApplications,
    BooksVendorCreditLines,
    BooksVendorCredits,
} from '../tinycld/books/types'

// The vendor credit fixture (vendor credit spec §4 Seed): the reference shots and the
// seed (seedVendorCredits) read it, so a row that does not add up, names a missing
// account or product, or is dated where another spec reads its accounts is a fixture bug.

const FIRST_DAY = '2026-11-10'

function linesOf(creditId: string) {
    return VENDOR_CREDIT_LINES.filter(line => line.vendor_credit === creditId)
}

function creditOf(id: string) {
    const row = VENDOR_CREDITS.find(credit => credit.id === id)
    if (!row) throw new Error(`no fixture credit ${id}`)
    return row
}

function seededApplications() {
    return VENDOR_CREDIT_SEED_APPLICATION_IDS.map(id => {
        const row = VENDOR_CREDIT_APPLICATIONS.find(app => app.id === id)
        if (!row) throw new Error(`no fixture application ${id}`)
        return row
    })
}

describe('generated vendor credit types', () => {
    it('the fixture types are the generated types, and the rows satisfy them', () => {
        // tsc fails here until the migration and the generated types exist.
        expectTypeOf<VendorCreditRecord>().toEqualTypeOf<BooksVendorCredits>()
        expectTypeOf<VendorCreditLineRecord>().toEqualTypeOf<BooksVendorCreditLines>()
        expectTypeOf<VendorCreditApplicationRecord>().toEqualTypeOf<BooksVendorCreditApplications>()
        expectTypeOf<VendorCreditLineFixtureRecord>().toEqualTypeOf<
            Omit<BooksVendorCreditLines, 'account'> & { account_number: string }
        >()
        VENDOR_CREDITS satisfies BooksVendorCredits[]
        VENDOR_CREDIT_APPLICATIONS satisfies BooksVendorCreditApplications[]
        const balance: BooksVendorCredits['balance'] = creditOf(VENDOR_CREDIT_IDS.partly).balance
        expect(balance).toBe(24_020)
    })
})

describe('VENDOR_CREDITS', () => {
    it('every credit’s total and subtotal equal the sum of its lines', () => {
        for (const row of VENDOR_CREDITS) {
            const sum = linesOf(row.id).reduce((total, line) => total + line.amount, 0)
            expect({ subtotal: row.subtotal, total: row.total }, row.id).toEqual({
                subtotal: sum,
                total: sum,
            })
        }
    })

    it('every id is 15 characters', () => {
        const ids = [
            ...VENDOR_CREDITS.map(row => row.id),
            ...VENDOR_CREDIT_LINES.map(row => row.id),
            ...VENDOR_CREDIT_APPLICATIONS.map(row => row.id),
            VENDOR_CREDIT_SEED_BILL.id,
        ]
        expect(ids.filter(id => id.length !== 15)).toEqual([])
    })

    it('dates every credit, the seeded bill and every application on 2026-11-10 or later', () => {
        const dated = [
            ...VENDOR_CREDITS.map(row => ({ id: row.id, date: row.date })),
            { id: VENDOR_CREDIT_SEED_BILL.id, date: VENDOR_CREDIT_SEED_BILL.date },
            ...VENDOR_CREDIT_APPLICATIONS.map(row => ({ id: row.id, date: row.date })),
        ]
        expect(dated.filter(row => row.date < FIRST_DAY).map(row => row.id)).toEqual([])
    })

    it('the seed ids name rows that exist, in the order unapplied, partly applied, void, draft', () => {
        expect(VENDOR_CREDIT_SEED_IDS).toEqual([
            VENDOR_CREDIT_IDS.unapplied,
            VENDOR_CREDIT_IDS.partly,
            VENDOR_CREDIT_IDS.voided,
            VENDOR_CREDIT_IDS.draft,
        ])
        const [unapplied, partly, voided, draft] = VENDOR_CREDIT_SEED_IDS.map(creditOf)
        expect(unapplied?.status).toBe('posted')
        expect(unapplied?.balance).toBe(unapplied?.total)
        expect(partly?.status).toBe('posted')
        expect(partly?.balance).toBeGreaterThan(0)
        expect(partly?.balance).toBeLessThan(partly?.total ?? 0)
        expect(voided?.status).toBe('void')
        expect(draft?.status).toBe('draft')
    })
})

describe('VENDOR_CREDIT_LINES', () => {
    it('names, on every account line, a seed account of a purchase type', () => {
        const purchaseNumbers = new Set(
            SEED_ACCOUNTS.filter(account => PURCHASE_ACCOUNT_TYPES.has(account.type)).map(
                account => account.number
            )
        )
        const accountLines = VENDOR_CREDIT_LINES.filter(line => line.kind === 'account')
        expect(accountLines.length).toBeGreaterThan(0)
        expect(
            accountLines.filter(line => !purchaseNumbers.has(line.account_number)).map(l => l.id)
        ).toEqual([])
    })

    it('names, on every product line, an active product the business purchases', () => {
        const purchased = new Set(
            PRODUCTS.filter(
                row =>
                    row.purchases &&
                    !row.inactive &&
                    (row.type === 'service' || row.type === 'non_inventory')
            ).map(row => row.id)
        )
        const productLines = VENDOR_CREDIT_LINES.filter(line => line.kind === 'item')
        expect(productLines.length).toBeGreaterThan(0)
        expect(productLines.filter(line => !purchased.has(line.product)).map(l => l.id)).toEqual([])
    })
})

// The reference shows the texts the form ships (plan, Decisions: Messages): a fixture
// text that differs from the shipped constant fails here.
describe('VENDOR_CREDIT_TEXTS', () => {
    const shipped = () => Object.values(VENDOR_CREDIT_MESSAGES).map(String)

    it('holds the shipped client texts', () => {
        for (const key of [
            'belowZero',
            'zeroTotal',
            'tooLarge',
            'tooManyLines',
            'voidNote',
            'noAccess',
            'notFound',
            'cannotEdit',
            'loadError',
        ] as const) {
            expect(shipped(), key).toContain(VENDOR_CREDIT_TEXTS[key])
        }
    })

    it('holds the shipped hint, delete confirm and conflict action', () => {
        expect(VENDOR_CREDIT_TEXTS.refHint).toBe(VENDOR_CREDIT_REF_HINT)
        expect(VENDOR_CREDIT_TEXTS.deleteDraft).toBe(
            `${VENDOR_CREDIT_MESSAGES.deleteTitle} ${VENDOR_CREDIT_MESSAGES.deleteBody}`
        )
        expect(documentConflictText(VENDOR_CREDIT_KIND.noun, 'posting')).toContain(
            VENDOR_CREDIT_TEXTS.conflictAction
        )
    })
})

// The apply dialog's texts: the client's from APPLY_CREDIT_MESSAGES and appliedToastText,
// the server's refusals from server/vendor_credit_applications.go.
describe('APPLY_CREDIT_TEXTS', () => {
    const go = () =>
        readFileSync(join(__dirname, '..', 'server', 'vendor_credit_applications.go'), 'utf8')

    it('holds the shipped client texts', () => {
        const m = APPLY_CREDIT_MESSAGES
        expect(APPLY_CREDIT_TEXTS.applyDateBeforeCredit).toBe(m.dateBeforeCredit)
        expect(APPLY_CREDIT_TEXTS.rowOverBalance).toBe(fillPaymentText(m.rowOverOpen, '$420.00'))
        expect(APPLY_CREDIT_TEXTS.overUnapplied).toBe(fillPaymentText(m.overUnapplied, '$650.00'))
        expect(APPLY_CREDIT_TEXTS.noneSelected).toBe(m.selectOne)
        expect(APPLY_CREDIT_TEXTS.loadFailed).toBe(m.loadFailed)
        expect(APPLY_CREDIT_TEXTS.noOpenBills).toBe(
            fillPaymentText(m.noOpenBills, 'Ironclad Equipment Rentals')
        )
        expect(APPLY_CREDIT_TEXTS.remove).toBe(fillPaymentText(m.removeBody, '1013', '$30.00'))
        expect(APPLY_CREDIT_TEXTS.toast).toBe(
            appliedToastText(VENDOR_CREDIT_APPLICATION.texts, 'credit', 65_000, 2, 'USD')
        )
    })

    it('holds the server refusals the dialog shows', () => {
        const source = go()
        for (const [template, text] of [
            ['Bill %s: the credit is more than its open balance of %s.', 'rowServerOver'],
            ['Bill %s is not open. Clear it to continue.', 'rowNotOpen'],
            ["The apply date can't be before the credit date.", 'applyDateBeforeCredit'],
            ['More than the unapplied credit of %s.', 'overUnapplied'],
        ] as const) {
            expect(source, text).toContain(`"${template}"`)
        }
        expect(APPLY_CREDIT_TEXTS.rowServerOver).toBe(
            fillPaymentText(
                'Bill %s: the credit is more than its open balance of %s.',
                '1004',
                '$420.00'
            )
        )
        expect(APPLY_CREDIT_TEXTS.rowNotOpen).toBe(
            fillPaymentText('Bill %s is not open. Clear it to continue.', '1007')
        )
        expect(APPLY_CREDIT_MESSAGES.dateBeforeCredit).toBe(
            "The apply date can't be before the credit date."
        )
        expect(APPLY_CREDIT_MESSAGES.overUnapplied).toBe('More than the unapplied credit of %s.')
    })
})

describe('the seeded bill and application', () => {
    it('puts the seeded bill on a vendor no other fixture bill names', () => {
        const otherVendors = new Set([
            ...BILLS.map(row => row.vendor),
            ...PAY_BILLS_BILLS.map(row => row.vendor),
            ...PAY_BILLS_SEED_BILLS.map(row => row.vendor),
        ])
        expect(otherVendors.has(VENDOR_CREDIT_SEED_BILL.vendor)).toBe(false)
    })

    it('applies the seeded credit to the seeded bill in full, from a credit of the bill’s vendor', () => {
        const applications = seededApplications()
        expect(applications.map(app => app.bill)).toEqual([VENDOR_CREDIT_SEED_BILL.id])
        const applied = applications.reduce((total, app) => total + app.amount, 0)
        expect(applied).toBe(VENDOR_CREDIT_SEED_BILL.total)
        for (const app of applications) {
            expect(VENDOR_CREDIT_SEED_IDS as readonly string[]).toContain(app.vendor_credit)
            expect(creditOf(app.vendor_credit).vendor).toBe(VENDOR_CREDIT_SEED_BILL.vendor)
        }
    })

    it('leaves the seeded application’s credit with a total above the applied amount', () => {
        for (const app of seededApplications()) {
            const credit = creditOf(app.vendor_credit)
            expect(credit.status).toBe('posted')
            expect(credit.total).toBeGreaterThan(app.amount)
            expect(credit.balance).toBe(credit.total - app.amount)
        }
    })
})
