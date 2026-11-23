import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, TEST_USER_NAME } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { DESKTOP } from './account-register-helpers'
import { reportSnapshot, snapshotWhen } from './books-report-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import {
    accountIdOf,
    createReconcileAccount,
    daysAgo,
    finishOneStatement,
    historyFilter,
    historyOrder,
    historyRow,
    openHistory,
    openReconcile,
    pickHistoryAccount,
    postDatedEntry,
    shownHistoryIds,
} from './reconcile-helpers'
import { uniqueName } from './record-form-helpers'
import { visibleScreen } from './screen-helpers'

// Reconciliation report spec §3 "The history", "The accounts screen" and "The finished
// summary" (its link to the history). Each test makes its own bank account in the Chart of
// Accounts, posts its own entries against 3000 Owner's Equity, dated today or a few days
// before, and finishes its own reconciliations. The load-error test reads only.

const PHONE = { width: 390, height: 844 }

async function signIn(page: Page): Promise<void> {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

type TwoStatements = { name: string; accountId: string; earlierId: string; laterId: string }

// A new bank account with two finished statements: the earlier one clears a deposit of
// $100.00 (statement balance $100.00), the later one a deposit of $50.00 ($150.00). Every
// entry is posted before the first reconciliation (lesson 38). Leaves the page on the
// accounts screen.
async function accountWithTwoStatements(page: Page): Promise<TwoStatements> {
    const name = await createReconcileAccount(page, 'bank')
    const stamp = uniqueName('rh')
    const first = `${stamp} first deposit`
    const second = `${stamp} second deposit`
    await postDatedEntry(page, {
        memo: first,
        amount: '100.00',
        debitAccount: name,
        creditAccount: ACCOUNT_LABELS.equity,
        date: daysAgo(3),
    })
    await postDatedEntry(page, {
        memo: second,
        amount: '50.00',
        debitAccount: name,
        creditAccount: ACCOUNT_LABELS.equity,
        date: daysAgo(1),
    })
    const earlier = await finishOneStatement(page, {
        accountName: name,
        date: daysAgo(2),
        balance: '100.00',
        clears: [first],
    })
    const later = await finishOneStatement(page, {
        accountName: name,
        date: daysAgo(0),
        balance: '150.00',
        clears: [second],
    })
    await openReconcile(page)
    const accountId = await accountIdOf(page, name)
    return { name, accountId, earlierId: earlier.id, laterId: later.id }
}

function reportUrlOf(reconciliationId: string): RegExp {
    return new RegExp(`/a/reports/[a-z0-9]{15}\\?(?:.*&)?p-statement=${reconciliationId}(?:&|$)`)
}

function summaryUrlOf(reconciliationId: string): RegExp {
    return new RegExp(`/books/reconcile/${reconciliationId}/?$`)
}

// The report opened for one statement shows its section, named by the account.
async function expectReportOf(page: Page, reconciliationId: string, name: string) {
    await expect(page.getByTestId('report-screen')).toBeVisible()
    await expect(page).toHaveURL(reportUrlOf(reconciliationId))
    const snapshot = await snapshotWhen(
        page,
        reportSnapshot,
        s => s.rows.some(row => row.kind === 'group'),
        "the statement's section"
    )
    const sections = snapshot.rows.filter(row => row.kind === 'group')
    expect(sections.map(row => row.label)).toHaveLength(1)
    expect(sections[0].label.startsWith(name), `section label "${sections[0].label}"`).toBe(true)
}

test.describe('reconciliation-report: history', () => {
    test('find a finished reconciliation in the history', async ({ page }) => {
        await signIn(page)
        const { name, accountId, earlierId, laterId } = await accountWithTwoStatements(page)

        // The History tab.
        await page.getByTestId('reconcile-tab-history').filter({ visible: true }).click()
        await visibleScreen(page, 'reconcile-history-screen')
        await expect(
            page.getByTestId('reconcile-tab-history').filter({ visible: true })
        ).toHaveAttribute('aria-selected', 'true')
        await expect(
            page.getByTestId('reconcile-history-table').filter({ visible: true })
        ).toBeVisible()
        await expect(historyFilter(page)).toContainText('All accounts')
        const all = await historyOrder(page)
        expect(all, 'both statements are in the history').toEqual(
            expect.arrayContaining([laterId, earlierId])
        )
        expect(all.indexOf(laterId), 'the later statement is above').toBeLessThan(
            all.indexOf(earlierId)
        )

        // The Account filter: only the account's two rows, and Clear filter.
        await pickHistoryAccount(page, accountId)
        await expect(historyFilter(page)).toContainText(name)
        await expect(
            page.getByTestId('reconcile-history-clear').filter({ visible: true })
        ).toBeVisible()
        await expect.poll(() => shownHistoryIds(page)).toEqual([laterId, earlierId])

        // The sort header reverses the dates.
        await page.getByTestId('reconcile-history-sort-date').filter({ visible: true }).click()
        await expect.poll(() => shownHistoryIds(page)).toEqual([earlierId, laterId])

        // A press on the row opens its finished summary.
        await historyRow(page, laterId).click()
        await expect(page).toHaveURL(summaryUrlOf(laterId))
        await expect(page.getByTestId('reconcile-finished').filter({ visible: true })).toBeVisible()

        // The summary's link opens the history with the account picked.
        await page.getByTestId('reconcile-history-link').filter({ visible: true }).click()
        await expect(page).toHaveURL(new RegExp(`/books/reconcile/history\\?account=${accountId}`))
        await visibleScreen(page, 'reconcile-history-screen')
        await expect(historyFilter(page)).toContainText(name)
        await expect.poll(() => shownHistoryIds(page)).toEqual([laterId, earlierId])

        // Clear filter.
        await page.getByTestId('reconcile-history-clear').filter({ visible: true }).click()
        await expect(historyFilter(page)).toContainText('All accounts')
        await expect(
            page.getByTestId('reconcile-history-clear').filter({ visible: true })
        ).toHaveCount(0)

        // The filter resets when the screen loses focus: pick it again, leave by the tab row.
        await pickHistoryAccount(page, accountId)
        await expect(historyFilter(page)).toContainText(name)
        await page.getByTestId('reconcile-tab-accounts').filter({ visible: true }).click()
        await visibleScreen(page, 'reconcile-accounts-screen')
        await expect(
            page.getByTestId('reconcile-tab-accounts').filter({ visible: true })
        ).toHaveAttribute('aria-selected', 'true')
        await page.getByTestId('reconcile-tab-history').filter({ visible: true }).click()
        await visibleScreen(page, 'reconcile-history-screen')
        await expect(historyFilter(page)).toContainText('All accounts')
        await expect(
            page.getByTestId('reconcile-history-clear').filter({ visible: true })
        ).toHaveCount(0)
    })

    test('a load error shows Retry', async ({ page }) => {
        await signIn(page)
        await openReconcile(page)
        // pbtsdb reports an error only for a 4xx (memory p1-account-register).
        await page.route('**/api/collections/books_reconciliations/records*', route =>
            route.fulfill({ status: 400, contentType: 'application/json', body: '{}' })
        )
        await page.getByTestId('reconcile-tab-history').filter({ visible: true }).click()
        await visibleScreen(page, 'reconcile-history-screen')
        const error = page.getByTestId('reconcile-history-error').filter({ visible: true })
        await expect(error).toBeVisible()
        await expect(error).toContainText('Books could not load the reconciliations.')

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('reconcile-history-retry').filter({ visible: true }).click()
        await expect(
            page
                .getByTestId('reconcile-history-table')
                .or(page.getByTestId('reconcile-history-empty'))
                .filter({ visible: true })
        ).toBeVisible()
        await expect(error).toHaveCount(0)
    })

    test('keys move, open and show the report', async ({ page }) => {
        await signIn(page)
        const { name, accountId, earlierId, laterId } = await accountWithTwoStatements(page)
        await page.getByTestId('reconcile-tab-history').filter({ visible: true }).click()
        await visibleScreen(page, 'reconcile-history-screen')
        await pickHistoryAccount(page, accountId)
        // The keys register once the rows show (lesson 41).
        await expect.poll(() => shownHistoryIds(page)).toEqual([laterId, earlierId])

        await page.keyboard.press('j')
        await expect(historyRow(page, laterId)).toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('j')
        await expect(historyRow(page, earlierId)).toHaveAttribute('data-focused', 'true')
        await expect(historyRow(page, laterId)).not.toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('k')
        await expect(historyRow(page, laterId)).toHaveAttribute('data-focused', 'true')

        // R opens the focused row's report.
        await page.keyboard.press('r')
        await expectReportOf(page, laterId, name)

        // Back: the history lost focus, so its filter is reset.
        await page.goBack()
        await visibleScreen(page, 'reconcile-history-screen')
        await expect(historyFilter(page)).toContainText('All accounts')

        // ↵ opens the focused row's finished summary.
        await pickHistoryAccount(page, accountId)
        await expect.poll(() => shownHistoryIds(page)).toEqual([laterId, earlierId])
        await page.keyboard.press('j')
        await expect(historyRow(page, laterId)).toHaveAttribute('data-focused', 'true')
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(summaryUrlOf(laterId))
        await expect(page.getByTestId('reconcile-finished').filter({ visible: true })).toBeVisible()
    })

    // The phone run is here because the cards and the card menu are other components than
    // the table row.
    test('phone: cards and the card menu', async ({ page }) => {
        await signIn(page)
        const name = await createReconcileAccount(page, 'bank')
        const deposit = uniqueName('rh phone deposit')
        await postDatedEntry(page, {
            memo: deposit,
            amount: '75.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(1),
        })
        const statementDate = daysAgo(0)
        const statement = await finishOneStatement(page, {
            accountName: name,
            date: statementDate,
            balance: '75.00',
            clears: [deposit],
        })
        await openReconcile(page)
        const accountId = await accountIdOf(page, name)
        await openHistory(page)

        await page.setViewportSize(PHONE)
        await expect(
            page.getByTestId('reconcile-history-cards').filter({ visible: true })
        ).toBeVisible()
        await expect(
            page.getByTestId('reconcile-history-table').filter({ visible: true })
        ).toHaveCount(0)
        await pickHistoryAccount(page, accountId)

        const card = historyRow(page, statement.id)
        await expect(card).toBeVisible()
        await expect(card).toContainText(formatDay(statementDate))
        await expect(card).toContainText('$75.00')
        await expect(card).toContainText(name)
        await expect(card).toContainText(`Reconciled ${formatDay(daysAgo(0))} by ${TEST_USER_NAME}`)

        // The card's menu: View report.
        await page
            .getByTestId(`reconcile-history-more-${statement.id}`)
            .filter({ visible: true })
            .click()
        await page
            .getByTestId(`reconcile-history-menu-report-${statement.id}`)
            .filter({ visible: true })
            .click()
        await expectReportOf(page, statement.id, name)

        // Back, then a press on the card opens the finished summary.
        await page.goBack()
        await visibleScreen(page, 'reconcile-history-screen')
        await pickHistoryAccount(page, accountId)
        await historyRow(page, statement.id).click()
        await expect(page).toHaveURL(summaryUrlOf(statement.id))
        await expect(page.getByTestId('reconcile-finished').filter({ visible: true })).toBeVisible()
    })
})
