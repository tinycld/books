import { expect, type Page, test } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import { rangeWords } from '@tinycld/core/reports/lib/dates'
import { REPORT_1099_TITLE } from '~/tinycld/books/lib/report-1099-fixture'
import { DESKTOP } from './account-register-helpers'
import { payPartOfBill } from './ap-aging-helpers'
import {
    browserToday,
    choosePeriod,
    expectedHeading,
    MANUAL_NOTE,
    manualBand,
    openEntriesFromSidebar,
    refreshReport,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { EXPENSE_URL } from './expense-helpers'
import { postBillOnAccounts, runLanded } from './expenses-by-vendor-helpers'
import { openBooks, uniqueName } from './record-form-helpers'
import {
    boxAccounts,
    boxRows,
    chooseForm,
    chooseForm1099Order,
    chooseShow,
    createUntrackedVendor,
    expenseFor,
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
import { createExpenseAccount, createTrackedVendor } from './vendor-1099-helpers'

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

    test('Show moves a vendor across the threshold the heading prints, and an untracked vendor shows only under Not tracked for 1099', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openForm1099Report(page)
        const threshold = await thresholdOf(page)
        // The report covers the Books screens; go back to Books from the rail, as a user
        // does, so the vendor and expense helpers start on the screen they need.
        await navigateToPackage(page, 'books')

        const tracked = uniqueName('Form1099 Edge Co')
        await createTrackedVendor(page, { name: tracked })
        // Made here, from the Vendors list that createTrackedVendor leaves: a second window
        // reopens Books at this session's last Books route (an expense's screen), where
        // createUntrackedVendor has no vendor list to start from.
        const untracked = uniqueName('Form1099 Untracked Co')
        await createUntrackedVendor(page, untracked)
        const boxed = await ownBoxedAccount(page, uniqueName('Edge Labor'), NEC_1)
        await expenseFor(page, {
            vendor: tracked,
            account: boxed.name,
            amount: centsText(threshold - 1),
        })

        await openFor(page, 'below', [tracked])
        const below = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, tracked) !== undefined,
            `${tracked} is under Below the threshold`
        )
        expect(figures(vendorRow(below, tracked)).reportable).toBe(threshold - 1)
        await chooseShow(page, 'meets')
        await expectNoRows(page)

        // The report stays open on `page`; a second window of the same session posts the
        // cent and the untracked vendor's expense.
        const poster = await page.context().newPage()
        try {
            await openBooks(poster, DESKTOP)
            await expenseFor(poster, { vendor: tracked, account: boxed.name, amount: '0.01' })
            await expenseFor(poster, {
                vendor: untracked,
                account: boxed.name,
                amount: centsText(threshold),
            })
        } finally {
            await poster.close()
        }

        await refreshReport(page)
        const meets = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, tracked) !== undefined,
            `${tracked} is under At or above the threshold after Refresh`
        )
        expect(figures(vendorRow(meets, tracked)).reportable).toBe(threshold)

        await filterTo1099Vendors(page, [untracked])
        const both = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRows(s).length > 0,
            'the vendor rows with both vendors picked'
        )
        expect(vendorRows(both).map(r => r.label)).toEqual([tracked])

        await chooseShow(page, 'below')
        await expectNoRows(page)

        await chooseShow(page, 'untracked')
        const notTracked = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, untracked) !== undefined,
            `${untracked} is under Not tracked for 1099`
        )
        expect(vendorRows(notTracked).map(r => r.label)).toEqual([untracked])
        expect(figures(vendorRow(notTracked, untracked)).all).toBe(threshold)

        await chooseShow(page, 'tracked')
        const all = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRow(s, tracked) !== undefined,
            `${tracked} is under All 1099 vendors`
        )
        expect(vendorRows(all).map(r => r.label)).toEqual([tracked])
    })

    test('Form 1099-NEC leaves out a MISC box, and Largest reportable orders by Reportable', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        // A sorts after B by name and before it by Reportable.
        const vendorA = uniqueName('Yarrow Form1099')
        const vendorB = uniqueName('Aspen Form1099')
        await createTrackedVendor(page, { name: vendorA })
        await createTrackedVendor(page, { name: vendorB })
        const nec = { name: uniqueName('Form Labor') }
        const misc = { name: uniqueName('Form Rent') }
        const necId = await createExpenseAccount(page, nec.name)
        const miscId = await createExpenseAccount(page, misc.name)
        await boxAccounts(page, [
            { id: necId, boxLabel: NEC_1 },
            { id: miscId, boxLabel: MISC_1 },
        ])
        await expenseFor(page, { vendor: vendorA, account: nec.name, amount: '300.00' })
        await expenseFor(page, { vendor: vendorA, account: misc.name, amount: '200.00' })
        await expenseFor(page, { vendor: vendorB, account: nec.name, amount: '400.00' })

        await openFor(page, 'tracked', [vendorA, vendorB])
        await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRows(s).length === 2,
            'both vendors show under All 1099 vendors'
        )

        await chooseForm(page, 'nec')
        await expect(page.getByTestId('report-header-param-form')).toHaveText('Form: 1099-NEC')
        const necOnly = await snapshotWhen(
            page,
            reportSnapshot,
            s => figures(vendorRow(s, vendorA)).all === 30000,
            `${vendorA} reads 300.00 under 1099-NEC`
        )
        expect(figures(vendorRow(necOnly, vendorA))).toEqual({
            reportable: 30000,
            excluded: null,
            all: 30000,
        })
        expect(boxRows(necOnly, vendorA).map(r => r.label)).toEqual([NEC_1])

        await chooseForm(page, 'misc')
        await expect(page.getByTestId('report-header-param-form')).toHaveText('Form: 1099-MISC')
        const miscOnly = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRows(s).length === 1,
            'only one vendor under 1099-MISC'
        )
        expect(vendorRows(miscOnly).map(r => r.label)).toEqual([vendorA])
        expect(figures(vendorRow(miscOnly, vendorA)).all).toBe(20000)
        expect(boxRows(miscOnly, vendorA).map(r => r.label)).toEqual([MISC_1])

        await chooseForm(page, 'all')
        const byName = await snapshotWhen(
            page,
            reportSnapshot,
            s => vendorRows(s).length === 2,
            'both vendors under NEC and MISC'
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
