import { expect, type Page, test } from '@playwright/test'
import { chooseParamOption, hubRow, login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import * as stlFixture from '~/tinycld/books/lib/sales-tax-liability-fixture'
import { TAX_AGENCIES, TAX_IDS, TAX_RATE_ROWS } from '~/tinycld/books/lib/tax-rates-fixture'
import { DESKTOP } from './account-register-helpers'
import {
    chooseAgencies,
    chooseOctober,
    choosePeriod,
    expectPhoneLines,
    openBooksReports,
    openReportAccount,
    openSalesTaxLiability,
    type ReportSnapshot,
    reportLinesUnder,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import {
    INVOICE_URL,
    lineCellTestId,
    openNewInvoice,
    pickInvoiceCustomer,
    pickLineProduct,
    uniqueMemo,
} from './invoice-helpers'
import { SALES_RECEIPT_URL } from './sales-receipt-helpers'
import {
    createAgency,
    createRate,
    fakeReadOnlyAccess,
    openTaxes,
    uniqueName,
} from './tax-rates-helpers'

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

// The opened rate whose documents no other seed or spec charges (D1): its two fixture
// invoices, top to bottom by date, with their customers. The seed numbers them itself.
const LODGING = rateName(TAX_IDS.lodging)
const LODGING_DOCUMENTS = [
    { id: 'stlinv000001051', label: /^2026-10-22 · Invoice \d+ · Fox Hollow Vineyards$/ },
    { id: 'stlinv000001053', label: /^2026-10-27 · Invoice \d+ · Evergreen Montessori School$/ },
]
// The fixture's sales receipt with no customer: its label ends after the number.
const WALK_IN_RECEIPT = /^2026-10-14 · Sales receipt \d+$/

type Figures = {
    gross: number | null
    nontaxable: number | null
    taxable: number | null
    tax: number | null
}

function figuresOf(row: Row): Figures {
    return {
        gross: cents(row.cells.gross),
        nontaxable: cents(row.cells.nontaxable),
        taxable: cents(row.cells.taxable),
        tax: cents(row.cells.tax),
    }
}

// The four figures of a fixture document's one tax line (cents).
function documentFigures(id: string): Figures {
    const document = stlFixture.SALES_TAX_DOCUMENTS.find(row => row.id === id)
    if (!document) throw new Error(`no fixture document ${id}`)
    const lines = stlFixture.taxLinesOf(document)
    if (lines.length !== 1) throw new Error(`${id} has ${lines.length} tax lines, want one`)
    const [line] = lines
    return {
        gross: line.gross_amount,
        nontaxable: line.gross_amount - line.taxable_amount,
        taxable: line.taxable_amount,
        tax: line.amount,
    }
}

// The one row of `kind` labelled `label`: before a rate opens, its document rows may carry
// the rate's name too, so a rate row is found by its kind.
function rowOfKind(snapshot: ReportSnapshot, kind: Row['kind'], label: string): Row {
    const found = snapshot.rows.filter(row => row.kind === kind && row.label === label)
    if (found.length !== 1) {
        throw new Error(
            `${found.length} ${kind} rows labelled "${label}" in ${labels(snapshot).join(' | ')}`
        )
    }
    return found[0]
}

// The rows of the opened Denver lodging, read once its total has landed.
function openedLodging(page: Page): Promise<ReportSnapshot> {
    return snapshotWhen(
        page,
        reportSnapshot,
        s =>
            reportLinesUnder(s, LODGING).length > 0 &&
            s.rows.some(row => row.kind === 'subtotal' && row.label === `Total ${LODGING}`),
        `${LODGING}'s document rows and its total`
    )
}

// The fixture's sales receipt under the 0% food rate.
const WEI_CHEN_RECEIPT = /^2026-10-28 · Sales receipt \d+ · Wei Chen$/

// The one document row under the opened `rate` whose label matches `label`.
function documentRow(snapshot: ReportSnapshot, rate: string, label: RegExp): Row {
    const found = reportLinesUnder(snapshot, rate).filter(row => label.test(row.label))
    if (found.length !== 1) {
        throw new Error(
            `${found.length} document rows of ${rate} match ${label} in ${labels(snapshot).join(' | ')}`
        )
    }
    return found[0]
}

function numberIn(label: string, pattern: RegExp): string {
    const number = pattern.exec(label)?.[1]
    if (!number) throw new Error(`no document number in "${label}"`)
    return number
}

// The phone run: the report is opened and set to October at the default viewport
// (navigateToPackage clicks the desktop rail), then the window shrinks to `size`.
async function expectPhoneLinesAt(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await openSalesTaxLiability(page)
    await chooseOctober(page)
    await page.setViewportSize(size)

    // While the rate is closed (an open group row leaves its figures to its total row):
    // the rate row, and the agency's total row, which shows only the Tax amount
    // (blankAbove "byRate").
    const agencyTotal = `Total ${agencyName(TAX_IDS.denver)}`
    const closed = await snapshotWhen(
        page,
        reportSnapshot,
        s =>
            s.rows.some(row => row.kind === 'group' && row.label === LODGING) &&
            s.rows.some(row => row.kind === 'subtotal' && row.label === agencyTotal),
        `the ${LODGING} row and ${agencyTotal}`
    )
    await expectPhoneLines(page, rowOfKind(closed, 'group', LODGING).id)
    const agency = rowOfKind(closed, 'subtotal', agencyTotal)
    expect(
        [agency.cells.gross ?? '', agency.cells.nontaxable ?? '', agency.cells.taxable ?? ''],
        `${agencyTotal}: no sales figure on a phone`
    ).toEqual(['', '', ''])
    expect(cents(agency.cells.tax), `${agencyTotal}: its Tax amount`).not.toBeNull()

    // On the phone the press target is the same row.
    await openReportAccount(page, LODGING)
    const snapshot = await openedLodging(page)
    const [firstDocument] = reportLinesUnder(snapshot, LODGING)
    expect(firstDocument.label, `${LODGING}'s first document row`).toMatch(
        LODGING_DOCUMENTS[0].label
    )
    await expectPhoneLines(page, firstDocument.id)
    await expectPhoneLines(page, rowOfKind(snapshot, 'subtotal', `Total ${LODGING}`).id)
}

const REPORT_URL = /\/a\/books\/reports\/[a-z0-9]{15}(\?|$)/

// A press on the Sales tax page's Liability report button, then the report screen.
async function pressLiabilityReport(page: Page) {
    await page.getByTestId('taxes-liability-report').click()
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page).toHaveURL(REPORT_URL)
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

    test('a rate opens into its documents, by date, with their figures', async ({ page }) => {
        await startBooks(page)
        await openSalesTaxLiability(page)
        await chooseOctober(page)

        await openReportAccount(page, LODGING)
        const lodging = await openedLodging(page)
        const lines = reportLinesUnder(lodging, LODGING)
        expect(
            lines.map(row => row.label),
            `${LODGING}'s document rows, top to bottom`
        ).toEqual([
            expect.stringMatching(LODGING_DOCUMENTS[0].label),
            expect.stringMatching(LODGING_DOCUMENTS[1].label),
        ])
        for (const [index, document] of LODGING_DOCUMENTS.entries()) {
            expect(figuresOf(lines[index]), `${lines[index].label}'s four figures (cents)`).toEqual(
                documentFigures(document.id)
            )
        }
        // The second invoice charged the rate on no taxable line: all Non-taxable.
        expect(figuresOf(lines[1])).toEqual({
            gross: 30_000,
            nontaxable: 30_000,
            taxable: 0,
            tax: 0,
        })

        const after = lodging.rows[lodging.rows.indexOf(lines[1]) + 1]
        expect(after?.label, `the row after ${LODGING}'s documents`).toBe(`Total ${LODGING}`)
        expect(figuresOf(after), `Total ${LODGING}'s four figures (cents)`).toEqual(
            stlFixture.salesTaxRateFigures(TAX_IDS.lodging)
        )

        const state = rateName(TAX_IDS.state)
        await openReportAccount(page, state)
        const opened = await snapshotWhen(
            page,
            reportSnapshot,
            s => reportLinesUnder(s, state).length > 0,
            `${state}'s document rows`
        )
        expect(
            reportLinesUnder(opened, state).map(row => row.label),
            `${state} lists the sales receipt with no customer`
        ).toEqual(expect.arrayContaining([expect.stringMatching(WALK_IN_RECEIPT)]))
    })

    test('a press on an invoice row opens the invoice', async ({ page }) => {
        await startBooks(page)
        await openSalesTaxLiability(page)
        await chooseOctober(page)

        await openReportAccount(page, LODGING)
        const lodging = await openedLodging(page)
        const invoice = documentRow(lodging, LODGING, LODGING_DOCUMENTS[0].label)
        const number = numberIn(invoice.label, /· Invoice (\d+) ·/)

        await page.getByTestId(`report-row-${invoice.id}`).click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page.getByTestId('invoice-read-only')).toBeVisible()
        await expect(page.getByTestId('invoice-title')).toHaveText(`Invoice ${number}`)
    })

    test('a press on a sales receipt row opens the sales receipt', async ({ page }) => {
        await startBooks(page)
        await openSalesTaxLiability(page)
        await chooseOctober(page)

        const food = rateName(TAX_IDS.foodExempt)
        await openReportAccount(page, food)
        const opened = await snapshotWhen(
            page,
            reportSnapshot,
            s => reportLinesUnder(s, food).some(row => WEI_CHEN_RECEIPT.test(row.label)),
            `${food}'s document rows`
        )
        const receipt = documentRow(opened, food, WEI_CHEN_RECEIPT)
        const number = numberIn(receipt.label, /· Sales receipt (\d+) ·/)

        await page.getByTestId(`report-row-${receipt.id}`).click()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(page.getByTestId('sales-receipt-read-only')).toBeVisible()
        await expect(page.getByTestId('sales-receipt-title')).toHaveText(`Sales receipt ${number}`)
    })

    test('a post and a void refresh the open report', async ({ page }) => {
        // D2: an agency and rate of the test's own, so no other spec's sales move the figures.
        await openTaxes(page)
        const agency = uniqueName('Liability agency')
        const rate = uniqueName('Liability rate')
        const agencyId = await createAgency(page, agency)
        await createRate(page, agencyId, rate, '5')

        const report = await page.context().newPage()
        await login(report)
        await navigateToPackage(report, 'books')
        await report.setViewportSize(TALL)
        await openSalesTaxLiability(report)
        await choosePeriod(report, { preset: 'thisMonthToDate' })
        // chooseAgencies waits for the agency's rows, and this agency has none yet.
        await chooseParamOption(report, 'agencies', {
            from: 'add-filter',
            search: agency,
            labels: [agency],
        })
        await expect.poll(() => new URL(report.url()).searchParams.get('p-agencies')).not.toBeNull()
        await expect(report.getByTestId('report-empty')).toBeVisible()

        await openNewInvoice(page)
        await pickInvoiceCustomer(page, 'Bluefin Marine Supply')
        const lineId = await pickLineProduct(page, 0, 'Wireless access point')
        await page.getByTestId(lineCellTestId(lineId, 'quantity')).fill('1')
        await page.getByTestId(lineCellTestId(lineId, 'rate')).fill('200.00')
        await expect(page.getByTestId(lineCellTestId(lineId, 'amount'))).toContainText('$200.00')
        await page.getByTestId('form-input-tax_rate').click()
        await page.getByRole('menuitem', { name: `${rate} 5%`, exact: true }).click()
        await expect(page.getByTestId('form-input-tax_rate')).toContainText(rate)
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Liability void'))
        await page.getByTestId('invoice-post').click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page.getByTestId('invoice-badge')).toHaveText('Posted')

        // No navigation on the report page: core re-runs the open report live.
        const posted = await snapshotWhen(
            report,
            reportSnapshot,
            s =>
                s.rows.some(row => row.kind === 'total') &&
                s.rows.some(row => row.label === `Total ${agency}`),
            'the report shows the posted invoice'
        )
        expect(labels(posted)).toEqual([agency, rate, `Total ${agency}`, 'Total'])
        for (const label of [rate, `Total ${agency}`, 'Total']) {
            expect(taxOf(rowLabelled(posted, label)), `${label} tax (cents)`).toBe(1000)
        }

        // Desktop: Void sits in the read view's bar (the More menu holds it only on a phone).
        await page.getByTestId('invoice-read-void').click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('invoice-badge')).toHaveText('Void')

        await expect(report.getByTestId('report-empty')).toBeVisible()
        await expect(
            report
                .locator('[data-testid^="report-row-"]')
                .filter({ has: report.getByText(agency, { exact: true }) })
        ).toHaveCount(0)
    })

    test('a reader opens the report from the Sales tax page', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await openTaxes(page)
        await expect(page.getByTestId('taxes-add-agency')).toHaveCount(0)
        await expect(page.getByTestId('taxes-liability-report')).toHaveText('Liability report')

        await pressLiabilityReport(page)
        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '',
            'the report title'
        )
        expect(snapshot.title).toBe(SALES_TAX_LIABILITY_TITLE)
    })

    test('with no shared report the Sales tax page shows no Liability report button', async ({
        page,
    }) => {
        // A read-only stub: the reports list answers with no row, so the reader has no
        // shipped report to open. Realtime is cut so no row arrives by another path.
        const asked: string[] = []
        await page.route('**/api/realtime*', route => route.abort())
        await page.route('**/api/collections/reports/records**', route => {
            const filter = new URL(route.request().url()).searchParams.get('filter') ?? ''
            asked.push(filter)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    page: 1,
                    perPage: 0,
                    totalItems: 0,
                    totalPages: 0,
                    items: [],
                }),
            })
        })
        await openTaxes(page)
        await expect(page.getByTestId('taxes-title')).toBeVisible()
        // The page asked for the shipped report and got none: without this the absent
        // button below would prove nothing.
        await expect
            .poll(
                () =>
                    asked.some(filter =>
                        filter.includes(stlFixture.SALES_TAX_LIABILITY_SHIPPED_KEY)
                    ),
                'the Sales tax page asks for the shipped Sales Tax Liability'
            )
            .toBe(true)
        await expect(page.getByTestId('taxes-liability-report')).toHaveCount(0)
    })

    test('on a 390 phone the Liability report button fits and opens the report', async ({
        page,
    }) => {
        await openTaxes(page)
        await page.setViewportSize({ width: 390, height: 844 })
        const button = page.getByTestId('taxes-liability-report')
        await expect(button).toBeVisible()
        await expect
            .poll(async () => {
                const box = await button.boundingBox()
                return box !== null && box.x >= 0 && box.x + box.width <= 390
            }, 'the button lies inside the 390 px viewport')
            .toBe(true)
        await pressLiabilityReport(page)
    })

    test('on a 390 phone each row is its label, then its figures on two lines', async ({
        page,
    }) => {
        await expectPhoneLinesAt(page, { width: 390, height: 844 })
    })

    // Lesson 32: CI's 390 viewport leaves a 375 px row.
    test('on a 375 phone each row is its label, then its figures on two lines', async ({
        page,
    }) => {
        await expectPhoneLinesAt(page, { width: 375, height: 812 })
    })
})
