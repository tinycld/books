import { expect, type Page, test } from '@playwright/test'
import { hubRow, login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import * as stlFixture from '~/tinycld/books/lib/sales-tax-liability-fixture'
import { TAX_AGENCIES, TAX_IDS, TAX_RATE_ROWS } from '~/tinycld/books/lib/tax-rates-fixture'
import { DESKTOP } from './account-register-helpers'
import {
    chooseAgencies,
    chooseOctober,
    choosePeriod,
    openBooksReports,
    openSalesTaxLiability,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'

// The shipped Sales Tax Liability in core's report view (/a/reports/<id>), read by the e2e
// user through the viewer share Books keeps. The seed posts the fixture's taxed invoices and
// sales receipts in October 2026 (SALES_TAX_DOCUMENTS) and numbers them itself, so no test
// reads a document label or number from the fixture.
//
// D1: the seed also posts other October invoices and sales receipts under Denver combined
// (Colorado state, RTD transit, Denver city), which other specs may edit or void on the
// shared DB. An exact figure is asserted only for the rates no other seed or spec charges
// (SALES_TAX_LIABILITY_OWN_RATES); the rest is asserted as relations inside one snapshot
// (an agency total = the sum of its rate rows' tax; Total = the sum of the agency totals).
//
// The table is a FlashList: only mounted rows are in the DOM. The tests run 1280 wide and
// tall enough that every row of October's report mounts at once.
//
// Not covered here (core's own e2e cover them for every report, D4): loading, error and
// Retry, Customize, sort, Copy link and Save as.

const {
    SALES_TAX_LIABILITY_DESCRIPTION,
    SALES_TAX_LIABILITY_EMPTY_FROM,
    SALES_TAX_LIABILITY_EMPTY_TO,
    SALES_TAX_LIABILITY_TITLE,
} = stlFixture

const TALL = { width: DESKTOP.width, height: 2000 }

type Row = ReportSnapshot['rows'][number]

async function startBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(TALL)
}

function rateName(id: string): string {
    const rate = TAX_RATE_ROWS.find(row => row.id === id)
    if (!rate) throw new Error(`no seeded tax rate ${id}`)
    return rate.name
}

function agencyName(id: string): string {
    const agency = TAX_AGENCIES.find(row => row.id === id)
    if (!agency) throw new Error(`no seeded tax agency ${id}`)
    return agency.name
}

// A figure cell's text in cents: "$1,200.00" and "1,200.00" → 120000, "-12.00" and
// "(12.00)" negative; null for a blank cell.
function cents(text: string | undefined): number | null {
    const value = (text ?? '').trim()
    if (value === '') return null
    const isNegative = /^[-−(]/.test(value) || value.endsWith(')')
    const digits = value.replace(/[^0-9.]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(digits)) throw new Error(`not an amount: "${text}"`)
    const [whole, fraction = ''] = digits.split('.')
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    return isNegative ? -amount : amount
}

function taxOf(row: Row): number {
    const value = cents(row.cells.tax)
    if (value === null) throw new Error(`${row.label} has no tax amount`)
    return value
}

function labels(snapshot: ReportSnapshot): string[] {
    return snapshot.rows.map(row => row.label)
}

function agencyRows(snapshot: ReportSnapshot): Row[] {
    return snapshot.rows.filter(row => row.kind === 'group' && row.depth === 0)
}

function rowLabelled(snapshot: ReportSnapshot, label: string): Row {
    const found = snapshot.rows.filter(row => row.label === label)
    if (found.length !== 1) {
        throw new Error(
            `${found.length} rows labelled "${label}" in ${labels(snapshot).join(' | ')}`
        )
    }
    return found[0]
}

// The rate rows between an agency's group row and its "Total <agency>".
function rateRowsOf(snapshot: ReportSnapshot, agency: string): Row[] {
    const start = snapshot.rows.findIndex(row => row.kind === 'group' && row.label === agency)
    const end = snapshot.rows.findIndex(
        row => row.kind === 'subtotal' && row.label === `Total ${agency}`
    )
    if (start < 0 || end < start) {
        throw new Error(`no ${agency} block in ${labels(snapshot).join(' | ')}`)
    }
    return snapshot.rows.slice(start + 1, end)
}

const OCTOBER_AGENCIES = [
    'City and County of Denver',
    'Colorado Department of Revenue',
    'Old county agency',
]

test.describe('sales-tax-liability: report', () => {
    test('opens from the Books hub with its params and columns', async ({ page }) => {
        await startBooks(page)
        await openBooksReports(page)
        const row = hubRow(page, SALES_TAX_LIABILITY_TITLE)
        await expect(row).toContainText(SALES_TAX_LIABILITY_DESCRIPTION)
        await row.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()

        await expect(page.getByTestId('report-param-period')).toHaveText('Period: Last month')
        // Agency has no default, so core lists it under Add filter, not as a chip.
        await expect(page.getByTestId('report-param-agencies')).toHaveCount(0)
        await page.getByTestId('report-add-filter').click()
        await expect(page.getByTestId('report-add-filter-agencies')).toHaveText('Agency')
        await page.keyboard.press('Escape')

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '' && Object.keys(s.headings).length > 0,
            'the report header and its column headings'
        )
        expect(snapshot.title).toBe(SALES_TAX_LIABILITY_TITLE)
        expect(snapshot.headings).toEqual({
            name: 'Tax name',
            gross: 'Gross total',
            nontaxable: 'Non-taxable',
            taxable: 'Taxable amount',
            tax: 'Tax amount',
        })
    })

    test('October shows each agency, its rates and its total, and the Total', async ({ page }) => {
        await startBooks(page)
        await openSalesTaxLiability(page)
        await chooseOctober(page)
        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s =>
                s.rows.some(row => row.kind === 'total') &&
                s.rows.some(row => row.label === `Total ${OCTOBER_AGENCIES.at(-1)}`),
            "October's rows down to the Total"
        )

        // Name order; the inactive Old county agency shows like an active one.
        expect(agencyRows(snapshot).map(row => row.label)).toEqual(OCTOBER_AGENCIES)

        let agencyTotals = 0
        for (const agency of OCTOBER_AGENCIES) {
            const rates = rateRowsOf(snapshot, agency)
            const names = rates.map(row => row.label)
            expect(
                rates.every(row => row.kind === 'group' && row.depth === 1),
                `${agency}: only rate rows`
            ).toBe(true)
            expect(names, `${agency}: rates in name order`).toEqual(
                [...names].sort((a, b) => a.localeCompare(b))
            )
            const total = rowLabelled(snapshot, `Total ${agency}`)
            expect(taxOf(total), `Total ${agency} = the sum of its rate rows' tax (cents)`).toBe(
                rates.reduce((sum, row) => sum + taxOf(row), 0)
            )
            agencyTotals += taxOf(total)
            for (const row of [rowLabelled(snapshot, agency), total]) {
                expect(
                    [row.cells.gross ?? '', row.cells.nontaxable ?? '', row.cells.taxable ?? ''],
                    `${row.label}: only the tax shows above the rate level`
                ).toEqual(['', '', ''])
            }
        }

        // The rates only the fixture charges: exact figures, under their own agency.
        for (const id of stlFixture.SALES_TAX_LIABILITY_OWN_RATES) {
            const name = rateName(id)
            const agency = agencyName(TAX_RATE_ROWS.find(row => row.id === id)?.agency ?? '')
            expect(
                rateRowsOf(snapshot, agency).map(row => row.label),
                `${name} under ${agency}`
            ).toContain(name)
            const row = rowLabelled(snapshot, name)
            const want = stlFixture.salesTaxRateFigures(id)
            expect(
                {
                    gross: cents(row.cells.gross),
                    nontaxable: cents(row.cells.nontaxable),
                    taxable: cents(row.cells.taxable),
                    tax: cents(row.cells.tax),
                },
                `${name}'s four figures (cents)`
            ).toEqual(want)
        }
        // A 0% rate shows its sales with tax 0.00.
        const food = rowLabelled(snapshot, rateName(TAX_IDS.foodExempt))
        expect(cents(food.cells.tax)).toBe(0)
        expect(cents(food.cells.taxable)).toBeGreaterThan(0)

        const grand = snapshot.rows.find(row => row.kind === 'total')
        if (!grand) throw new Error('no Total row')
        expect(
            [grand.cells.gross ?? '', grand.cells.nontaxable ?? '', grand.cells.taxable ?? ''],
            'the Total shows only the tax'
        ).toEqual(['', '', ''])
        expect(taxOf(grand), 'Total = the sum of the agency totals (cents)').toBe(agencyTotals)
    })

    test('the Agency filter keeps only the chosen agency, inactive included', async ({ page }) => {
        await startBooks(page)
        await openSalesTaxLiability(page)
        await chooseOctober(page)
        await chooseAgencies(page, ['Old county agency'])

        const snapshot = await reportSnapshot(page)
        expect(labels(snapshot)).toEqual([
            'Old county agency',
            'Old county rate',
            'Total Old county agency',
            'Total',
        ])
        const tax = stlFixture.salesTaxRateFigures(TAX_IDS.oldCountyRate).tax
        expect(tax).toBe(500)
        for (const label of ['Old county rate', 'Total Old county agency', 'Total']) {
            expect(taxOf(rowLabelled(snapshot, label)), `${label} tax (cents)`).toBe(tax)
        }
    })

    test('a month with no posted taxed sale shows the empty text', async ({ page }) => {
        await startBooks(page)
        await openSalesTaxLiability(page)
        await choosePeriod(page, {
            from: SALES_TAX_LIABILITY_EMPTY_FROM,
            to: SALES_TAX_LIABILITY_EMPTY_TO,
        })
        await expect(page.getByTestId('report-empty')).toContainText(
            'No rows for September 1 – September 30, 2026'
        )
        await expect(page.locator('[data-testid^="report-row-g:"]')).toHaveCount(0)
    })
})
