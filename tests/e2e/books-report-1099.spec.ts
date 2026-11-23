import { expect, type Page, test } from '@playwright/test'
import { inStatement, navigateToPackage, waitForTableFit } from '@tinycld/core/e2e-helpers'
import { rangeWords } from '@tinycld/core/reports/lib/dates'
import { AP_AGING_TITLE } from '~/tinycld/books/lib/ap-aging-fixture'
import { EXPENSES_BY_VENDOR_TITLE } from '~/tinycld/books/lib/expenses-by-vendor-fixture'
import { REPORT_1099_TITLE } from '~/tinycld/books/lib/report-1099-fixture'
import {
    AP_AGING_SHIPPED_KEY,
    EXPENSES_BY_VENDOR_SHIPPED_KEY,
    FORM_1099_SHIPPED_KEY,
    VENDOR_BALANCE_SHIPPED_KEY,
} from '~/tinycld/books/lib/shipped-reports'
import { VENDOR_BALANCE_TITLE } from '~/tinycld/books/lib/vendor-balance-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import { payPartOfBill } from './ap-aging-helpers'
import { freshPageWithReports } from './ar-aging-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import {
    browserToday,
    choosePeriod,
    expectedHeading,
    expectTableFits,
    MANUAL_NOTE,
    manualBand,
    openEntriesFromSidebar,
    refreshReport,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { EXPENSE_URL } from './expense-helpers'
import { expectLabelsWrapWhole, postBillOnAccounts, runLanded } from './expenses-by-vendor-helpers'
import { CLASSIC_SCROLLBARS, openBooks, uniqueName } from './record-form-helpers'
import {
    boxAccounts,
    boxRows,
    chooseForm,
    chooseForm1099Order,
    chooseShow,
    createUntrackedVendor,
    expectForm1099RowsFit,
    expenseFor,
    FORM_1099_PHONE_LINES,
    figures,
    filterTo1099Vendors,
    LEDGER_TOPICS,
    openBox,
    openForm1099Report,
    ownBoxedAccount,
    paymentLines,
    realtimeTopics,
    thresholdOf,
    totalRow,
    vendorRow,
    vendorRows,
} from './report-1099-helpers'
import { expectSalesPhoneLines } from './sales-reports-helpers'
import {
    createExpenseAccount,
    createTrackedVendor,
    openForm1099,
    visible,
} from './vendor-1099-helpers'
import { openVendorsList, vendorEntries } from './vendor-form-helpers'

// The 1099 Summary and Detail (report-1099 checkpoint 2): the shipped report from the
// Books hub. Each test creates its own vendors and accounts through the UI, posts expenses
// dated today (the form's default), sets Show, filters the report to its vendors and sets a
// Custom period of today, so every figure it asserts is its own. No test changes the shared
// threshold: test 3 reads it from the heading.

const NEC_1 = 'NEC 1 · Nonemployee compensation'
const MISC_1 = 'MISC 1 · Rents'

// Sets the Custom period from `from` to `to` and waits for the run of that period: core
// keeps the previous run's rows on screen until the new run lands.
async function chooseDays(page: Page, from: string, to: string): Promise<void> {
    const landed = runLanded(page, params => {
        const period = params.period as { from?: string; to?: string } | undefined
        return period?.from === from && period?.to === to
    })
    await choosePeriod(page, { from, to })
    await landed
}

// Opens the report, sets Show, narrows it to `names` and to today.
async function openFor(
    page: Page,
    show: Parameters<typeof chooseShow>[1],
    names: readonly string[]
): Promise<void> {
    const today = await browserToday(page)
    await openForm1099Report(page)
    if (show !== 'meets') await chooseShow(page, show)
    await filterTo1099Vendors(page, names)
    await chooseDays(page, today, today)
}

// The report's empty state: no vendor of the filter is under this Show choice.
async function expectNoRows(page: Page): Promise<void> {
    await expect(page.getByTestId('report-empty')).toBeVisible()
    await expect(
        page.locator('[data-testid^="report-row-g:"], [data-testid^="report-row-d:"]')
    ).toHaveCount(0)
}

function centsText(cents: number): string {
    return (cents / 100).toFixed(2)
}

test.describe('report-1099: report', () => {
    test('opens from the Reports hub on This calendar year with the threshold in its heading, and a period with no payment is empty', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openForm1099Report(page)

        const snapshot = await snapshotWhen(
            page,
            reportSnapshot,
            s => s.title !== '',
            'the report header'
        )
        expect(snapshot.title).toBe(REPORT_1099_TITLE)
        await expect
            .poll(async () => {
                const expected = await expectedHeading(page)
                return expected !== '' && (await reportSnapshot(page)).business === expected
            })
            .toBe(true)
        const year = (await browserToday(page)).slice(0, 4)
        expect((await reportSnapshot(page)).header).toBe(
            rangeWords(`${year}-01-01`, `${year}-12-31`)
        )
        await expect(page.getByTestId('report-header-param-show')).toHaveText(
            'Vendors: At or above the threshold'
        )
        await expect(page.getByTestId('report-header-param-form')).toHaveText('Form: NEC and MISC')
        await expect(page.getByTestId('report-header-param-header-0')).toHaveText(
            /^1099 threshold: /
        )

        const chips = await page
            .getByTestId('report-controls')
            .locator('[data-testid^="report-param-"]')
            .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
        expect(chips).toEqual([
            'report-param-period',
            'report-param-show',
            'report-param-form',
            'report-param-order',
        ])
        await expect(page.getByTestId('report-param-period')).toContainText('This calendar year')
        // Vendor has no default, so core lists it under Add filter, not as a chip.
        await page.getByTestId('report-add-filter').click()
        await expect(page.getByTestId('report-add-filter-vendors')).toHaveText('Vendor')
        await page.keyboard.press('Escape')

        await chooseDays(page, '2020-01-01', '2020-01-31')
        await expect(page.getByTestId('report-empty-message')).toHaveText(
            `No rows for ${rangeWords('2020-01-01', '2020-01-31')}`
        )
        await expect(page.getByTestId('report-empty-action')).toHaveText('Show this calendar year')
        await expect(
            page.locator('[data-testid^="report-row-g:"], [data-testid^="report-row-d:"]')
        ).toHaveCount(0)
    })

    test('an expense by check is Reportable in its box, and a payment on an account with no box is Not reported', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const vendor = uniqueName('Form1099 Check Co')
        await createTrackedVendor(page, { name: vendor })
        const noBox = uniqueName('Team Meals')
        await createExpenseAccount(page, noBox)
        const boxed = await ownBoxedAccount(page, uniqueName('Contract Labor'), NEC_1)
        await expenseFor(page, { vendor, account: boxed.name, amount: '2400.00' })
        await expenseFor(page, { vendor, account: noBox, amount: '310.00' })

        await openFor(page, 'tracked', [vendor])
        const shown = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 271000,
            `${vendor} reads 2,710.00 in All payments`
        )
        expect(vendorRows(shown).map(r => r.label)).toEqual([vendor])
        expect(figures(vendorRow(shown, vendor))).toEqual({
            reportable: 240000,
            excluded: 31000,
            all: 271000,
        })
        const boxes = boxRows(shown, vendor)
        expect(boxes.map(r => r.label)).toEqual([NEC_1, 'Not reported'])
        expect(boxes.map(figures)).toEqual([
            { reportable: 240000, excluded: null, all: 240000 },
            { reportable: 0, excluded: 31000, all: 31000 },
        ])
        expect(figures(totalRow(shown))).toEqual(figures(vendorRow(shown, vendor)))
    })

    test('Show puts a vendor one cent under the threshold the heading prints under Below, and one at it under At or above', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openForm1099Report(page)
        const threshold = await thresholdOf(page)
        // The report covers the Books screens; go back to Books from the rail, as a user
        // does, so the vendor and expense helpers start on the screen they need.
        await navigateToPackage(page, 'books')

        const under = uniqueName('Form1099 Under Co')
        const at = uniqueName('Form1099 At Co')
        await createTrackedVendor(page, { name: under })
        await createTrackedVendor(page, { name: at })
        const boxed = await ownBoxedAccount(page, uniqueName('Edge Labor'), NEC_1)
        await expenseFor(page, {
            vendor: under,
            account: boxed.name,
            amount: centsText(threshold - 1),
        })
        await expenseFor(page, { vendor: at, account: boxed.name, amount: centsText(threshold) })

        await openFor(page, 'below', [under, at])
        const below = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, under) !== undefined,
            `${under} is under Below the threshold`
        )
        expect(vendorRows(below).map(r => r.label)).toEqual([under])
        expect(figures(vendorRow(below, under)).reportable).toBe(threshold - 1)

        await chooseShow(page, 'meets')
        // Only the At or above run shows `at`: the Below run had `under` alone.
        const meets = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, at) !== undefined,
            `${at} is under At or above the threshold`
        )
        expect(vendorRows(meets).map(r => r.label)).toEqual([at])
        expect(figures(vendorRow(meets, at)).reportable).toBe(threshold)
    })

    test('an untracked vendor shows only under Not tracked for 1099', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const untracked = uniqueName('Form1099 Untracked Co')
        await createUntrackedVendor(page, untracked)
        const boxed = await ownBoxedAccount(page, uniqueName('Untracked Labor'), NEC_1)
        // Reportable in a box and at or above the threshold (checked below): a tracked vendor
        // with this payment would show under At or above the threshold.
        const amount = 9_900_000
        await expenseFor(page, {
            vendor: untracked,
            account: boxed.name,
            amount: centsText(amount),
        })

        await openFor(page, 'untracked', [untracked])
        expect(amount).toBeGreaterThanOrEqual(await thresholdOf(page))
        const notTracked = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, untracked) !== undefined,
            `${untracked} is under Not tracked for 1099`
        )
        expect(vendorRows(notTracked).map(r => r.label)).toEqual([untracked])
        expect(figures(vendorRow(notTracked, untracked)).all).toBe(amount)

        await chooseShow(page, 'meets')
        await expectNoRows(page)
        await chooseShow(page, 'below')
        await expectNoRows(page)
        await chooseShow(page, 'tracked')
        await expectNoRows(page)
    })

    test('Form 1099-NEC leaves out a MISC box, and Form 1099-MISC an NEC box', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const vendor = uniqueName('Form1099 Form Co')
        await createTrackedVendor(page, { name: vendor })
        const nec = { name: uniqueName('Form Labor') }
        const misc = { name: uniqueName('Form Rent') }
        const necId = await createExpenseAccount(page, nec.name)
        const miscId = await createExpenseAccount(page, misc.name)
        await boxAccounts(page, [
            { id: necId, boxLabel: NEC_1 },
            { id: miscId, boxLabel: MISC_1 },
        ])
        await expenseFor(page, { vendor, account: nec.name, amount: '300.00' })
        await expenseFor(page, { vendor, account: misc.name, amount: '200.00' })

        await openFor(page, 'tracked', [vendor])
        await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 50000,
            `${vendor} reads 500.00 under NEC and MISC`
        )

        await chooseForm(page, 'nec')
        await expect(page.getByTestId('report-header-param-form')).toHaveText('Form: 1099-NEC')
        const necOnly = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 30000,
            `${vendor} reads 300.00 under 1099-NEC`
        )
        expect(figures(vendorRow(necOnly, vendor))).toEqual({
            reportable: 30000,
            excluded: null,
            all: 30000,
        })
        expect(boxRows(necOnly, vendor).map(r => r.label)).toEqual([NEC_1])

        await chooseForm(page, 'misc')
        await expect(page.getByTestId('report-header-param-form')).toHaveText('Form: 1099-MISC')
        const miscOnly = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 20000,
            `${vendor} reads 200.00 under 1099-MISC`
        )
        expect(vendorRows(miscOnly).map(r => r.label)).toEqual([vendor])
        expect(figures(vendorRow(miscOnly, vendor)).all).toBe(20000)
        expect(boxRows(miscOnly, vendor).map(r => r.label)).toEqual([MISC_1])
    })

    test('a vendor with no payment in a box of the chosen form has no row', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const vendor = uniqueName('Form1099 NecOnly Co')
        await createTrackedVendor(page, { name: vendor })
        const boxed = await ownBoxedAccount(page, uniqueName('NecOnly Labor'), NEC_1)
        await expenseFor(page, { vendor, account: boxed.name, amount: '300.00' })

        await openFor(page, 'tracked', [vendor])
        const shown = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 30000,
            `${vendor} reads 300.00 under NEC and MISC`
        )
        expect(vendorRows(shown).map(r => r.label)).toEqual([vendor])

        await chooseForm(page, 'misc')
        await expect(page.getByTestId('report-header-param-form')).toHaveText('Form: 1099-MISC')
        await expectNoRows(page)
    })

    test('Largest reportable orders the vendors by Reportable', async ({ page }) => {
        await openBooks(page, DESKTOP)
        // A sorts after B by name and before it by Reportable.
        const vendorA = uniqueName('Yarrow Form1099')
        const vendorB = uniqueName('Aspen Form1099')
        await createTrackedVendor(page, { name: vendorA })
        await createTrackedVendor(page, { name: vendorB })
        const boxed = await ownBoxedAccount(page, uniqueName('Order Labor'), NEC_1)
        await expenseFor(page, { vendor: vendorA, account: boxed.name, amount: '500.00' })
        await expenseFor(page, { vendor: vendorB, account: boxed.name, amount: '400.00' })

        await openFor(page, 'tracked', [vendorA, vendorB])
        const byName = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRows(s).length === 2,
            'both vendors under All 1099 vendors'
        )
        expect(vendorRows(byName).map(r => r.label)).toEqual([vendorB, vendorA])

        await chooseForm1099Order(page, 'amount')
        const byAmount = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRows(s)[0]?.label === vendorA,
            `${vendorA} (500.00) first by Largest reportable`
        )
        expect(vendorRows(byAmount).map(r => r.label)).toEqual([vendorA, vendorB])
        expect(figures(vendorRow(byAmount, vendorA)).reportable).toBe(50000)
    })
})

// report-1099 checkpoint 3: an opened box's payments, a press on a payment, and Refresh.
test.describe('report-1099: payments', () => {
    test('an expense by credit card is Excluded and its payment says paid by card', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const today = await browserToday(page)
        const vendor = uniqueName('Form1099 Card Co')
        await createTrackedVendor(page, { name: vendor })
        const boxed = await ownBoxedAccount(page, uniqueName('Card Labor'), NEC_1)
        const checkNo = await expenseFor(page, { vendor, account: boxed.name, amount: '500.00' })
        const cardNo = await expenseFor(page, {
            vendor,
            account: boxed.name,
            amount: '120.00',
            method: 'Credit card',
        })

        await openFor(page, 'tracked', [vendor])
        const shown = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 62000,
            `${vendor} reads 620.00 in All payments`
        )
        expect(figures(vendorRow(shown, vendor))).toEqual({
            reportable: 50000,
            excluded: 12000,
            all: 62000,
        })

        await openBox(page, vendor, NEC_1)
        const lines = paymentLines(await reportSnapshot(page), vendor, NEC_1)
        expect(lines.map(line => line.label)).toEqual([
            `${today} · Expense ${checkNo} · ${boxed.name}`,
            `${today} · Expense ${cardNo} · ${boxed.name} · paid by card`,
        ])
        expect(lines.map(figures)).toEqual([
            { reportable: 50000, excluded: null, all: 50000 },
            { reportable: 0, excluded: 12000, all: 12000 },
        ])
    })

    test('a bill shows nothing until it is paid, then the paid share', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const vendor = uniqueName('Form1099 Bill Co')
        const vendorId = await createTrackedVendor(page, { name: vendor })
        const boxed = await ownBoxedAccount(page, uniqueName('Bill Labor'), NEC_1)
        // postBillOnAccounts starts from the entries list (openNewBill).
        await openEntriesFromSidebar(page)
        const bill = await postBillOnAccounts(page, vendor, [
            { account: boxed.name, amount: '400.00' },
        ])

        await openFor(page, 'tracked', [vendor])
        await expectNoRows(page)

        // The report stays open on `page`; a second window of the same session pays the
        // bill. It reopens Books at the bill, whose Back leads to the entries list that
        // payPartOfBill starts from.
        const poster = await page.context().newPage()
        let paymentNo = ''
        try {
            await openBooks(poster, DESKTOP)
            paymentNo = await payPartOfBill(poster, {
                vendor: { id: vendorId, name: vendor },
                billId: bill.id,
                amount: '100.00',
            })
        } finally {
            await poster.close()
        }

        await refreshReport(page)
        const paid = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 10000,
            `${vendor} reads 100.00 after the payment and Refresh`
        )
        expect(figures(vendorRow(paid, vendor))).toEqual({
            reportable: 10000,
            excluded: null,
            all: 10000,
        })
        await openBox(page, vendor, NEC_1)
        const lines = paymentLines(await reportSnapshot(page), vendor, NEC_1)
        expect(lines).toHaveLength(1)
        expect(lines[0].label).toContain(`Bill payment ${paymentNo}`)
        expect(lines[0].label).toContain(`Bill ${bill.number} paid (cash basis)`)
        expect(figures(lines[0])).toEqual({ reportable: 10000, excluded: null, all: 10000 })
    })

    test('a press on a payment lands on its document', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const vendor = uniqueName('Form1099 Press Co')
        await createTrackedVendor(page, { name: vendor })
        const boxed = await ownBoxedAccount(page, uniqueName('Press Labor'), NEC_1)
        const expenseNo = await expenseFor(page, { vendor, account: boxed.name, amount: '250.00' })

        await openFor(page, 'tracked', [vendor])
        await openBox(page, vendor, NEC_1)
        const opened = await reportSnapshot(page)
        const line = paymentLines(opened, vendor, NEC_1).find(row =>
            row.label.includes(` · Expense ${expenseNo} · `)
        )
        if (!line) throw new Error(`no payment row of Expense ${expenseNo}`)

        // As report-drill-down.spec.ts presses a line: its label is a link named "Open: …".
        const label = page.getByTestId('report-table').getByTestId(`report-row-${line.id}`)
        await expect(label).toHaveRole('link')
        await expect(label).toHaveAccessibleName(`Open: ${line.label}`)
        await label.click()
        await expect(page).toHaveURL(EXPENSE_URL)
        await expect(page.getByTestId('expense-read-only').filter({ visible: true })).toBeVisible()
        await expect(page.getByTestId('expense-title').filter({ visible: true })).toHaveText(
            `Expense ${expenseNo}`
        )

        await page.goBack()
        await expect(
            page.getByTestId('report-document-title').filter({ visible: true })
        ).toHaveText(REPORT_1099_TITLE)
        const back = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).all === 25000,
            `${vendor} again after Back`
        )
        expect(vendorRows(back).map(r => r.label)).toEqual([vendor])
    })

    test('the report shows Refresh, and a new post shows only after it', async ({ page }) => {
        // Every report run `page` sends, and the topic set of each realtime subscribe it
        // sends (each subscribe carries the client's whole set).
        const runs: (string | null)[] = []
        let subscribed: string[] = []
        page.on('request', request => {
            const path = new URL(request.url()).pathname
            if (request.method() !== 'POST') return
            if (path === '/api/reports/run') runs.push(request.postData())
            if (path === '/api/realtime') subscribed = realtimeTopics(request)
        })

        await openBooks(page, DESKTOP)
        const vendor = uniqueName('Form1099 Refresh Co')
        await createTrackedVendor(page, { name: vendor })
        const boxed = await ownBoxedAccount(page, uniqueName('Refresh Labor'), NEC_1)
        await expenseFor(page, { vendor, account: boxed.name, amount: '300.00' })

        await openFor(page, 'tracked', [vendor])
        await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).reportable === 30000,
            `${vendor} reads 300.00 Reportable`
        )
        // Core draws this band for a report that is not live
        // (core/reports/components/ReportManualBand.tsx, test id report-manual-band).
        const { band, note, refresh } = manualBand(page)
        await expect(band).toBeVisible()
        await expect(note).toHaveText(MANUAL_NOTE)
        await expect(refresh).toBeVisible()
        const openBody = runs.at(-1)
        expect(openBody, 'the open report sent its run').toBeTruthy()
        const runsBeforePost = runs.length

        // A second window of the same session posts the expense.
        const poster = await page.context().newPage()
        try {
            await openBooks(poster, DESKTOP)
            await expenseFor(poster, { vendor, account: boxed.name, amount: '200.00' })
        } finally {
            await poster.close()
        }

        // The report follows no ledger topic, so no signal of the post can reach it, and it
        // sent no run of its own body again: its rows are those of the run before the post.
        expect(subscribed, 'the page sent a realtime subscribe').not.toEqual([])
        expect(subscribed.filter(topic => LEDGER_TOPICS.includes(topic))).toEqual([])
        expect(runs.slice(runsBeforePost).filter(body => body === openBody)).toEqual([])
        const unchanged = await reportSnapshot(page)
        expect(figures(vendorRow(unchanged, vendor))).toEqual({
            reportable: 30000,
            excluded: null,
            all: 30000,
        })

        await refreshReport(page)
        const refreshed = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendor)).reportable === 50000,
            `${vendor} reads 500.00 Reportable after Refresh`
        )
        expect(figures(vendorRow(refreshed, vendor))).toEqual({
            reportable: 50000,
            excluded: null,
            all: 50000,
        })
    })
})

// The Vendors list's Reports menu items in the order they are drawn: the visible
// `vendors-reports-…` test ids (as books-expenses-by-vendor.spec.ts reads them).
function reportsMenuItems(page: Page): Promise<(string | null)[]> {
    return page
        .locator('[data-testid^="vendors-reports-"]')
        .filter({ visible: true })
        .evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')))
}

// The three reports of the menu other than this one, as the reports list read answers them.
const OTHER_VENDOR_REPORTS = [
    { id: 'f1099balancerp1', shipped_key: VENDOR_BALANCE_SHIPPED_KEY, title: VENDOR_BALANCE_TITLE },
    { id: 'f1099agingrept1', shipped_key: AP_AGING_SHIPPED_KEY, title: AP_AGING_TITLE },
    {
        id: 'f1099expensesr1',
        shipped_key: EXPENSES_BY_VENDOR_SHIPPED_KEY,
        title: EXPENSES_BY_VENDOR_TITLE,
    },
]

// Long line descriptions (spec §3 "Phone"): with the date, number and account, each payment
// label wraps in the 375 px and the 360 px row and stays within three lines.
const CHECK_DESCRIPTION = 'Studio design suite renewal'
const CARD_DESCRIPTION = 'Conference booth artwork'

// Spec §3 "Phone" when the `mobile` arrangement does not fit the row (eight-digit figures in
// a 360 px row): the label on line 1, Reportable and Excluded on line 2, All payments on
// line 3.
const FORM_1099_NARROW_LINES = [['reportable', 'excluded'], ['all']] as const

// Waits until core has fitted the report table to the width its rows have now, and asserts
// that width: the viewport less the 15 px stable gutter of the classic scrollbars.
async function expectRowWidth(page: Page, width: number): Promise<void> {
    await expect(page.getByTestId('toolbar-more-button')).toBeVisible()
    await waitForTableFit(page)
    await expect(inStatement(page, 'report-table')).toHaveAttribute('data-fit-width', String(width))
}

// Spec §3 "Phone" at the current viewport: the vendor row and each payment row of the opened
// box have the label on line 1 and the figures on `phoneLines` below it, the payment labels
// wrap whole, and nothing is cut or scrolls sideways.
async function expectOpenedBoxFitsPhone(
    page: Page,
    vendor: string,
    paymentCount: number,
    phoneLines: readonly (readonly string[])[]
): Promise<void> {
    const shown = await snapshotWhen(
        page,
        reportSnapshot,
        s => vendorRow(s, vendor) !== undefined && paymentLines(s, vendor, NEC_1).length > 0,
        `the ${vendor} row and its opened box are mounted`
    )
    const row = vendorRow(shown, vendor)
    if (!row) throw new Error(`no mounted row "${vendor}"`)
    await expectSalesPhoneLines(page, row.id, phoneLines)
    const lines = paymentLines(shown, vendor, NEC_1)
    expect(lines, `the ${paymentCount} payment rows of ${NEC_1}`).toHaveLength(paymentCount)
    for (const line of lines) await expectSalesPhoneLines(page, line.id, phoneLines)
    await expectLabelsWrapWhole(
        page,
        lines.map(line => line.id)
    )
    await expectForm1099RowsFit(page)
    await expectTableFits(page)
}

// report-1099 checkpoint 5: the entry points and the phone rows.
test.describe('report-1099: entry points and phone rows', () => {
    // No phone run of the menu: it is the same component and logic at both widths.
    test("the Vendors list's Reports menu lists 1099 Summary and Detail fourth, for a reader too, and draws only the reports that are found", async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page, DESKTOP)
        await openVendorsList(page)
        // A reader page: the header shows the Reports menu and no New vendor button.
        const reports = page.getByTestId('vendors-reports')
        await expect(reports).toBeVisible()
        await expect(page.getByTestId('vendor-new-header')).toHaveCount(0)
        await reports.click()
        await expect(
            page.getByTestId('vendors-reports-expenses').filter({ visible: true })
        ).toHaveText('Expenses by Vendor')
        await expect
            .poll(() => reportsMenuItems(page), {
                message:
                    'the menu holds Vendor Balance, A/P Aging, Expenses by Vendor, 1099 Summary and Detail in order',
            })
            .toEqual([
                'vendors-reports-balance',
                'vendors-reports-aging',
                'vendors-reports-expenses',
                'vendors-reports-1099',
            ])
        const form1099 = page.getByTestId('vendors-reports-1099').filter({ visible: true })
        await expect(form1099).toHaveText(REPORT_1099_TITLE)
        await form1099.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(page).toHaveURL(/\/a\/reports\//)
        await expect(
            page.getByTestId('report-document-title').filter({ visible: true })
        ).toHaveText(REPORT_1099_TITLE)

        // The 1099 report is not found: after its read answered with no row, the menu holds
        // the other three only.
        const threeOnly = await freshPageWithReports(page, OTHER_VENDOR_REPORTS)
        await openBooks(threeOnly.fresh, DESKTOP)
        await openVendorsList(threeOnly.fresh)
        await expect
            .poll(() => threeOnly.answered.some(filter => filter.includes(FORM_1099_SHIPPED_KEY)), {
                message: 'the Vendors list got its answer for the 1099 report',
            })
            .toBe(true)
        await expect(vendorEntries(threeOnly.fresh).first()).toBeVisible()
        await threeOnly.fresh.getByTestId('vendors-reports').click()
        await expect(
            threeOnly.fresh.getByTestId('vendors-reports-expenses').filter({ visible: true })
        ).toHaveText('Expenses by Vendor')
        await expect
            .poll(() => reportsMenuItems(threeOnly.fresh))
            .toEqual([
                'vendors-reports-balance',
                'vendors-reports-aging',
                'vendors-reports-expenses',
            ])
        await expect(threeOnly.fresh.getByTestId('vendors-reports-1099')).toHaveCount(0)
        await threeOnly.fresh.close()
    })

    // No phone run: the section and its button are the same code at every width.
    test('Settings → 1099s opens the 1099 report, for a reader too, and has no button when the report is not found', async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await openBooks(page, DESKTOP)
        await openForm1099(page)
        await expect(visible(page, 'books-1099-section')).toBeVisible()
        // A reader page: the threshold shows as a value, with no input.
        await expect(visible(page, 'books-1099-threshold-value')).toBeVisible()
        await expect(page.getByTestId('books-1099-threshold')).toHaveCount(0)
        const open = visible(page, 'books-1099-open-report')
        await expect(open).toContainText('Open the 1099 report')
        await open.click()
        await expect(page.getByTestId('report-screen')).toBeVisible()
        await expect(page).toHaveURL(/\/a\/reports\//)
        await expect(
            page.getByTestId('report-document-title').filter({ visible: true })
        ).toHaveText(REPORT_1099_TITLE)

        // The 1099 report is not found: after its read answered with no row, the section
        // draws its three cards and no button.
        const none = await freshPageWithReports(page, OTHER_VENDOR_REPORTS)
        await openBooks(none.fresh, DESKTOP)
        await openForm1099(none.fresh)
        await expect
            .poll(() => none.answered.some(filter => filter.includes(FORM_1099_SHIPPED_KEY)), {
                message: 'Settings → 1099s got its answer for the 1099 report',
            })
            .toBe(true)
        await expect(visible(none.fresh, 'books-1099-section')).toBeVisible()
        await expect(visible(none.fresh, 'books-1099-threshold-value')).toBeVisible()
        await expect(
            visible(none.fresh, 'books-1099-accounts').or(
                visible(none.fresh, 'books-1099-accounts-empty')
            )
        ).toBeVisible()
        await expect(
            visible(none.fresh, 'books-1099-vendors').or(
                visible(none.fresh, 'books-1099-vendors-empty')
            )
        ).toBeVisible()
        await expect(none.fresh.getByTestId('books-1099-open-report')).toHaveCount(0)
        await none.fresh.close()
    })

    // The phone runs: the phone path is other code (the report's `display.layouts` `mobile`
    // arrangement, core's phone row layout). Both give the page classic scrollbars, as Linux
    // (CI) and Windows draw them, so the rows' stable gutter takes 15 px on every machine
    // (macOS overlay scrollbars take none): the 390 px phone gives the 375 px row of D1
    // (lesson 21), and the 375 px phone a 360 px row.
    test('an opened box reads on a 390 px phone in the two-line phone rows with no sideways scroll', async ({
        page,
    }) => {
        const vendor = await openPhoneVendor(page)

        await page.setViewportSize(PHONE)
        await expectRowWidth(page, 375)
        await expect(inStatement(page, 'report-table')).toHaveAttribute('data-layout', 'mobile')
        const closed = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, vendor) !== undefined,
            `the ${vendor} row is mounted at 390`
        )
        const row = vendorRow(closed, vendor)
        if (!row) throw new Error(`no mounted row "${vendor}"`)
        await expectSalesPhoneLines(page, row.id, FORM_1099_PHONE_LINES)
        await openBox(page, vendor, NEC_1)
        await expect(inStatement(page, 'report-table')).toHaveAttribute('data-layout', 'mobile')
        await expectOpenedBoxFitsPhone(page, vendor, 2, FORM_1099_PHONE_LINES)
    })

    test('an opened box reads on a 375 px phone with All payments on line 3 and no sideways scroll', async ({
        page,
    }) => {
        const vendor = await openPhoneVendor(page)

        await page.setViewportSize({ width: 375, height: 844 })
        await expectRowWidth(page, 360)
        await openBox(page, vendor, NEC_1)
        await expectOpenedBoxFitsPhone(page, vendor, 2, FORM_1099_NARROW_LINES)
    })
})

// The setup of the phone runs: a tracked vendor with two payments of eight-digit figures in
// one NEC box, one by check and one by card with long descriptions. Leaves the report open
// at desktop width on today, narrowed to the vendor, with classic scrollbars. Returns the
// vendor's name.
async function openPhoneVendor(page: Page): Promise<string> {
    await openBooks(page, DESKTOP)
    const vendor = uniqueName('Form1099 Phone Co')
    await createTrackedVendor(page, { name: vendor })
    const boxed = await ownBoxedAccount(page, uniqueName('Phone Labor'), NEC_1)
    await expenseFor(page, {
        vendor,
        account: boxed.name,
        amount: '640152.50',
        description: CHECK_DESCRIPTION,
    })
    await expenseFor(page, {
        vendor,
        account: boxed.name,
        amount: '66100.00',
        method: 'Credit card',
        description: CARD_DESCRIPTION,
    })

    await openFor(page, 'tracked', [vendor])
    const shown = await snapshotWhen(
        page,
        reportSnapshot,
        s => figures(vendorRow(s, vendor)).all === 70625250,
        `${vendor} reads 706,252.50 in All payments`
    )
    expect(figures(vendorRow(shown, vendor))).toEqual({
        reportable: 64015250,
        excluded: 6610000,
        all: 70625250,
    })
    // Classic scrollbars, as Windows and Linux (CI) draw them: the rows' stable gutter takes
    // width from them. macOS draws overlay scrollbars, which take none.
    await page.addStyleTag({ content: CLASSIC_SCROLLBARS })
    return vendor
}
