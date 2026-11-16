import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, pressToolbar, rowOf } from '@tinycld/core/e2e-helpers'
import {
    figureDigits,
    openProfitAndLoss,
    pressFigure,
    type ReportSnapshot,
    reportSnapshot,
    snapshotWhen,
    tdLinesOf,
    tdSnapshot,
} from './books-report-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    CHECKING,
    DESKTOP,
    filterToVendor,
    localDay,
    openPayBills,
    PAY_BILLS_URL,
    PHONE,
    payBillsRowAmount,
    pickSelect,
    postedNumber,
    shown,
    vendorWithBills,
} from './pay-bills-helpers'
import { createExpenseAccount } from './vendor-1099-helpers'

// The Method param on the Profit and Loss (pay-bills spec §3.10): a bill of 500.00 on an
// expense account of the test's own, 200.00 of it paid on Pay Bills today. On Accrual the
// account reads 500.00; on Cash only the 200.00 paid, and the figure drills to Transaction
// Detail on Cash, which lists the payment's share line. The account is the test's own, so
// no other spec's bill moves its figure.

function amountOf(snapshot: ReportSnapshot, label: string): string {
    const row = snapshot.rows.find(r => r.kind === 'group' && r.label === label)
    return figureDigits(row?.cells.amount)
}

// Folds the statement and opens Expenses to the account's row; the fold is kept per
// report, so it holds when the Method changes.
async function openExpensesTo(page: Page, account: string): Promise<void> {
    await pressToolbar(page, 'report-fold-all', 'Collapse all')
    await snapshotWhen(
        page,
        reportSnapshot,
        s => !s.rows.some(r => r.label === account),
        'the statement folded to its sections'
    )
    await rowOf(page, 'Expenses').click()
    await snapshotWhen(
        page,
        reportSnapshot,
        s => s.rows.some(r => r.kind === 'group' && r.label === account),
        `the ${account} row under Expenses`
    )
}

test.describe('pay-bills: cash basis on the Profit and Loss', () => {
    test('a part-paid bill counts on Cash only as far as it is paid', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)

        const account = uniqueMemo('AA Cash basis expense')
        await createExpenseAccount(page, account)
        // vendorWithBills starts from the Lists hub; the chart is not a way to it.
        await page.getByTestId('books-nav-lists').click()
        await expect(shown(page, 'books-list-card-vendors')).toBeVisible()
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '500.00', due: await localDay(page, 10), account }],
        })
        const [bill] = bills

        // 200.00 of the 500.00 paid today.
        await openPayBills(page)
        await filterToVendor(page, vendor)
        await payBillsRowAmount(page, bill.id).fill('200.00')
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await page.getByTestId('pay-bills-pay').click()
        await postedNumber(page)
        await expect(page).not.toHaveURL(PAY_BILLS_URL)

        await openProfitAndLoss(page)
        await page.getByTestId('report-param-period').click()
        await page.getByTestId('report-period-preset-thisMonth').click()
        await expect(page.getByTestId('report-period-popover')).toHaveCount(0)
        await openExpensesTo(page, account)

        // Accrual: the whole bill.
        const basis = page.getByTestId('report-header-param-method')
        await expect(basis).toHaveText('Accrual basis')
        await snapshotWhen(
            page,
            reportSnapshot,
            s => amountOf(s, account) === '500.00',
            `${account} at 500.00 on Accrual`
        )

        // Cash: only the 200.00 paid.
        await page.getByTestId('report-param-method').click()
        await page.getByTestId('report-filter-option-cash').click()
        await expect(basis).toHaveText('Cash basis')
        await expect(page.getByTestId('report-param-method')).toContainText('Cash')
        await snapshotWhen(
            page,
            reportSnapshot,
            s => amountOf(s, account) === '200.00',
            `${account} at 200.00 on Cash`
        )

        // The figure opens Transaction Detail on Cash with the payment's share line.
        await pressFigure(page, 'amount', account)
        const detail = await snapshotWhen(
            page,
            tdSnapshot,
            s => s.title === 'Transaction Detail by Account' && tdLinesOf(s, account).length > 0,
            `Transaction Detail with ${account}'s lines`
        )
        expect(detail.chips.method).toContain('Cash')
        const memo = `Bill ${bill.number} paid (cash basis)`
        const share = tdLinesOf(detail, account).filter(l => l.cells.description === memo)
        expect(share.map(l => figureDigits(l.cells.amount))).toEqual(['200.00'])

        // On a phone the Method chip and the basis line still show.
        await page.goBack()
        await expect(page.getByTestId('report-document-title')).toHaveText('Profit and Loss')
        await page.setViewportSize(PHONE)
        await expect(shown(page, 'report-param-method')).toContainText('Cash')
        await expect(shown(page, 'report-header-param-method')).toHaveText('Cash basis')
    })
})
