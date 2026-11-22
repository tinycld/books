import { expect, type Page, test } from '@playwright/test'
import { navigateToPackage } from '@tinycld/core/e2e-helpers'
import { rangeWords } from '@tinycld/core/reports/lib/dates'
import { REPORT_1099_TITLE } from '~/tinycld/books/lib/report-1099-fixture'
import { DESKTOP } from './account-register-helpers'
import {
    browserToday,
    choosePeriod,
    expectedHeading,
    refreshReport,
    reportSnapshot,
    snapshotWhen,
} from './books-report-helpers'
import { runLanded } from './expenses-by-vendor-helpers'
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
    openForm1099Report,
    ownBoxedAccount,
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
