import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { RECONCILIATION_REPORT_SEED } from '../../tinycld/books/lib/reconciliation-report-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { DESKTOP, openRegister, PHONE, revealRegisterItem } from './account-register-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import {
    accountIdOf,
    createReconcileAccount,
    daysAgo,
    fakeAccessLevel,
    finishOneStatement,
    historyRow,
    lineBox,
    lineIdOf,
    lineRow,
    openFinishedSummary,
    openHistory,
    openReconcile,
    openUndoFromHistory,
    openWorkScreen,
    pickHistoryAccount,
    postDatedEntry,
    shownHistoryIds,
    startReconciliation,
} from './reconcile-helpers'
import { uniqueName } from './record-form-helpers'
import { visibleScreen } from './screen-helpers'

// Reconciliation report spec §3 "Undo", "The history" (the row's More menu), "The finished
// summary" (its More menu) and §4 "Writes". Each admin test makes its own bank account in
// the Chart of Accounts, posts its own entries against 3000 Owner's Equity, dated today or
// a few days before, and finishes its own reconciliations. The reader and bookkeeper test
// must fake its books_access before login (lesson 32), so it reads the seeded
// reconciliations of 2100 Company Card (fixed ids, read only); it undoes nothing.

const SEEDED_CARD = '2100 Company Card'

async function signIn(page: Page): Promise<void> {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

function visible(page: Page, testId: string): Locator {
    return page.getByTestId(testId).filter({ visible: true })
}

function summaryUrlOf(reconciliationId: string): RegExp {
    return new RegExp(`/books/reconcile/${reconciliationId}/?$`)
}

// Waits two animation frames, so a navigation a key press started can land.
async function nextFrames(page: Page): Promise<void> {
    await page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
    )
}

// The register's visible row that shows `memo` exactly (an earlier register can stay
// stacked and hidden).
function registerRow(page: Page, memo: string): Locator {
    return page
        .locator('[data-testid^="register-row-"]')
        .filter({ has: page.getByText(memo, { exact: true }), visible: true })
}

async function chooseVoid(page: Page): Promise<Locator> {
    await visible(page, 'entry-actions').getByRole('button', { name: 'Void', exact: true }).click()
    const dialog = page.getByTestId('void-dialog')
    await expect(dialog).toBeVisible()
    return dialog
}

type OneStatement = { name: string; id: string; memos: string[] }

// A new bank account with one finished statement of today that clears the deposits of
// `amounts` (each dated today). Leaves the page on the finished summary.
async function accountWithOneStatement(
    page: Page,
    amounts: readonly string[],
    balance: string
): Promise<OneStatement> {
    const name = await createReconcileAccount(page, 'bank')
    const stamp = uniqueName('ru')
    const memos = amounts.map((_, index) => `${stamp} deposit ${index + 1}`)
    for (const [index, amount] of amounts.entries()) {
        await postDatedEntry(page, {
            memo: memos[index],
            amount,
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(0),
        })
    }
    const statement = await finishOneStatement(page, {
        accountName: name,
        date: daysAgo(0),
        balance,
        clears: memos,
    })
    return { name, id: statement.id, memos }
}

type TwoStatements = { name: string; accountId: string; earlierId: string; laterId: string }

// A new bank account with two finished statements, both before today, so a third can start
// today: the earlier one clears a deposit of $100.00, the later one a deposit of $50.00.
// Every entry is posted before the first reconciliation (lesson 38).
async function accountWithTwoStatements(page: Page): Promise<TwoStatements> {
    const name = await createReconcileAccount(page, 'bank')
    const stamp = uniqueName('ru')
    const first = `${stamp} first deposit`
    const second = `${stamp} second deposit`
    await postDatedEntry(page, {
        memo: first,
        amount: '100.00',
        debitAccount: name,
        creditAccount: ACCOUNT_LABELS.equity,
        date: daysAgo(4),
    })
    await postDatedEntry(page, {
        memo: second,
        amount: '50.00',
        debitAccount: name,
        creditAccount: ACCOUNT_LABELS.equity,
        date: daysAgo(2),
    })
    const earlier = await finishOneStatement(page, {
        accountName: name,
        date: daysAgo(3),
        balance: '100.00',
        clears: [first],
    })
    const later = await finishOneStatement(page, {
        accountName: name,
        date: daysAgo(1),
        balance: '150.00',
        clears: [second],
    })
    await openReconcile(page)
    const accountId = await accountIdOf(page, name)
    return { name, accountId, earlierId: earlier.id, laterId: later.id }
}

// The finished summary's More menu, then its Undo reconciliation; waits for the dialog.
async function openUndoFromSummary(page: Page): Promise<Locator> {
    await visible(page, 'reconcile-finished-more').click()
    await visible(page, 'reconcile-menu-undo').click()
    const dialog = visible(page, 'reconcile-undo-dialog')
    await expect(dialog).toBeVisible()
    return dialog
}

test.describe('reconciliation-report: undo', () => {
    test('an admin undoes the latest reconciliation', async ({ page }) => {
        await signIn(page)
        // An earlier finished statement keeps the account in the history's Account filter
        // after the undo, so the filtered list shows that the undone row left it. Every
        // entry is posted before the first reconciliation (lesson 38).
        const name = await createReconcileAccount(page, 'bank')
        const stamp = uniqueName('ru')
        const earlierMemo = `${stamp} earlier deposit`
        const kept = `${stamp} deposit 1`
        const voided = `${stamp} deposit 2`
        await postDatedEntry(page, {
            memo: earlierMemo,
            amount: '10.00',
            debitAccount: name,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(2),
        })
        for (const [memo, amount] of [
            [kept, '60.00'],
            [voided, '40.00'],
        ]) {
            await postDatedEntry(page, {
                memo,
                amount,
                debitAccount: name,
                creditAccount: ACCOUNT_LABELS.equity,
                date: daysAgo(0),
            })
        }
        const earlier = await finishOneStatement(page, {
            accountName: name,
            date: daysAgo(1),
            balance: '10.00',
            clears: [earlierMemo],
        })
        const { id } = await finishOneStatement(page, {
            accountName: name,
            date: daysAgo(0),
            balance: '110.00',
            clears: [kept, voided],
        })
        await openReconcile(page)
        const accountId = await accountIdOf(page, name)

        // The history's row menu opens the dialog.
        await openHistory(page)
        await pickHistoryAccount(page, accountId)
        await expect.poll(() => shownHistoryIds(page)).toEqual([id, earlier.id])
        const dialog = await openUndoFromHistory(page, id)
        const text = dialog.getByTestId('reconcile-undo-text')
        await expect(text).toContainText(name)
        await expect(text).toContainText('Its 2 transactions are no longer reconciled')

        // The undo: the work screen of that reconciliation, in progress, with the result line
        // and both rows still cleared.
        await dialog.getByTestId('reconcile-undo-submit').click()
        await expect(page).toHaveURL(summaryUrlOf(id))
        await visibleScreen(page, 'reconcile-screen')
        await expect(visible(page, 'reconcile-finished')).toHaveCount(0)
        await expect(visible(page, 'reconcile-status')).toHaveCount(0)
        await expect(visible(page, 'reconcile-finish')).toBeVisible()
        await expect(visible(page, 'reconcile-result')).toHaveText(
            'The reconciliation is in progress again. Its 2 transactions stay cleared.'
        )
        await expect(lineBox(page, kept)).toHaveAttribute('aria-checked', 'true')
        await expect(lineBox(page, voided)).toHaveAttribute('aria-checked', 'true')
        const keptLine = await lineIdOf(lineRow(page, kept))
        const voidedLine = await lineIdOf(lineRow(page, voided))

        // The History tab, filtered to the account, no longer has the row.
        await openHistory(page)
        await pickHistoryAccount(page, accountId)
        await expect
            .poll(() => shownHistoryIds(page), {
                message: 'the undone reconciliation left the history',
            })
            .toEqual([earlier.id])

        // The register reads Cleared for both lines.
        await openRegister(page, name)
        await expect(visible(page, 'register-title')).toContainText(name)
        await revealRegisterItem(page, registerRow(page, kept))
        await expect(visible(page, `register-cell-status-${keptLine}`)).toHaveText('Cleared')
        await expect(visible(page, `register-cell-status-${voidedLine}`)).toHaveText('Cleared')

        // A void of one of them now passes, and removes its cleared mark.
        await openWorkScreen(page, name)
        await visible(page, `reconcile-link-${voidedLine}`).click()
        await expect(visible(page, 'entry-read-only')).toContainText(voided)
        const voiding = await chooseVoid(page)
        await voiding.getByTestId('void-confirm').click()
        await expect(visible(page, 'entry-badge')).toHaveText('Void')
        await expect(page.getByTestId('entry-error-summary')).toHaveCount(0)

        await openWorkScreen(page, name)
        await expect(lineRow(page, voided)).toHaveCount(0)
        await expect(lineBox(page, kept)).toHaveAttribute('aria-checked', 'true')
    })

    test('only the latest one can be undone, and one in progress blocks', async ({ page }) => {
        await signIn(page)
        const { name, accountId, earlierId, laterId } = await accountWithTwoStatements(page)

        // In the history the later row has the menu, the earlier one has none.
        await openHistory(page)
        await pickHistoryAccount(page, accountId)
        await expect.poll(() => shownHistoryIds(page)).toEqual([laterId, earlierId])
        await expect(visible(page, `reconcile-history-more-${laterId}`)).toBeVisible()
        await expect(visible(page, `reconcile-history-report-${earlierId}`)).toBeVisible()
        await expect(visible(page, `reconcile-history-more-${earlierId}`)).toHaveCount(0)
        await expect(page.getByTestId(`reconcile-history-undo-${earlierId}`)).toHaveCount(0)

        // The later one's summary has the More menu.
        await historyRow(page, laterId).click()
        await expect(page).toHaveURL(summaryUrlOf(laterId))
        await expect(visible(page, 'reconcile-finished')).toBeVisible()
        await expect(visible(page, 'reconcile-finished-more')).toBeVisible()

        // Back from the summary with its undo dialog open: the history shows no dialog.
        await openUndoFromSummary(page)
        await page.goBack()
        await visibleScreen(page, 'reconcile-history-screen')
        await nextFrames(page)
        await expect(
            visible(page, 'reconcile-undo-dialog'),
            'the undo dialog opened on the summary stays off the history'
        ).toHaveCount(0)

        // The earlier one's summary has none.
        await pickHistoryAccount(page, accountId)
        await expect.poll(() => shownHistoryIds(page)).toEqual([laterId, earlierId])
        await historyRow(page, earlierId).click()
        await expect(page).toHaveURL(summaryUrlOf(earlierId))
        await expect(visible(page, 'reconcile-finished')).toBeVisible()
        await expect(visible(page, 'reconcile-view-report')).toBeVisible()
        await expect(visible(page, 'reconcile-finished-more')).toHaveCount(0)

        // A third reconciliation, left in progress.
        const today = daysAgo(0)
        const thirdId = await startReconciliation(page, name, { balance: '150.00', date: today })

        // The later one's summary: with its More menu open, R does not open the report.
        await openFinishedSummary(page, name)
        await expect(page).toHaveURL(summaryUrlOf(laterId))
        await expect(visible(page, 'reconcile-view-report')).toBeVisible()
        await visible(page, 'reconcile-finished-more').click()
        const undoItem = visible(page, 'reconcile-menu-undo')
        await expect(undoItem).toBeVisible()
        await page.keyboard.press('r')
        await nextFrames(page)
        await expect(page).toHaveURL(summaryUrlOf(laterId))
        await expect(page.getByTestId('report-screen')).toHaveCount(0)
        await expect(undoItem).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(undoItem).toHaveCount(0)

        // Undo is blocked by the reconciliation in progress.
        const dialog = await openUndoFromSummary(page)
        await expect(dialog.getByTestId('reconcile-undo-blocked')).toContainText(
            `has a reconciliation in progress (statement of ${formatDay(today)})`
        )
        await expect(dialog.getByTestId('reconcile-undo-submit')).toHaveCount(0)
        await dialog.getByTestId('reconcile-undo-open').click()
        await expect(page).toHaveURL(summaryUrlOf(thirdId))
        await visibleScreen(page, 'reconcile-screen')
        await expect(visible(page, 'reconcile-finish')).toBeVisible()
    })

    test('a refusal shows in the dialog and the row stays', async ({ page }) => {
        await signIn(page)
        const { name, id } = await accountWithOneStatement(page, ['25.00'], '25.00')
        const refusal = `Only the latest reconciliation of ${name} can be undone. Undo the statement of Nov 30, 2026 first.`
        await page.route(`**/api/collections/books_reconciliations/records/${id}*`, route => {
            if (route.request().method() !== 'PATCH') return route.fallback()
            return route.fulfill({ status: 400, json: { message: refusal, data: {} } })
        })

        const dialog = await openUndoFromSummary(page)
        const submit = dialog.getByTestId('reconcile-undo-submit')
        const answered = page.waitForResponse(
            response =>
                response.request().method() === 'PATCH' &&
                response.url().includes(`/api/collections/books_reconciliations/records/${id}`)
        )
        await submit.click()
        await answered
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('entry-error-summary')).toContainText(refusal)
        await expect(submit).toBeEnabled()

        await page.unrouteAll({ behavior: 'wait' })
        await dialog.getByTestId('reconcile-undo-cancel').click()
        await expect(visible(page, 'reconcile-undo-dialog')).toHaveCount(0)
        await expect(page).toHaveURL(summaryUrlOf(id))
        await expect(visible(page, 'reconcile-finished')).toBeVisible()
        await expect(visible(page, 'reconcile-status')).toHaveText('Reconciled')

        await openReconcile(page)
        const accountId = await accountIdOf(page, name)
        await openHistory(page)
        await pickHistoryAccount(page, accountId)
        await expect.poll(() => shownHistoryIds(page)).toEqual([id])
    })

    for (const level of ['read_only', 'bookkeeper'] as const) {
        const who = level === 'read_only' ? 'a read-only user' : 'a bookkeeper'
        test(`${who} sees no Undo`, async ({ page }) => {
            await fakeAccessLevel(page, level)
            await signIn(page)
            const latestId = RECONCILIATION_REPORT_SEED.latest.id
            await openReconcile(page)
            const cardId = await accountIdOf(page, SEEDED_CARD)

            await openHistory(page)
            await pickHistoryAccount(page, cardId)
            await expect(historyRow(page, latestId)).toBeVisible()
            await expect(visible(page, `reconcile-history-report-${latestId}`)).toBeVisible()
            await expect(visible(page, `reconcile-history-more-${latestId}`)).toHaveCount(0)

            await historyRow(page, latestId).click()
            await expect(page).toHaveURL(summaryUrlOf(latestId))
            await expect(visible(page, 'reconcile-finished')).toBeVisible()
            await expect(visible(page, 'reconcile-view-report')).toBeVisible()
            await expect(visible(page, 'reconcile-finished-more')).toHaveCount(0)
        })
    }

    // The phone run is here because the card menu and the sheet are other components than
    // the table's menu and the dialog.
    test('phone: undo from the card menu in a sheet', async ({ page }) => {
        await signIn(page)
        const { name, id } = await accountWithOneStatement(page, ['35.00'], '35.00')
        await openReconcile(page)
        const accountId = await accountIdOf(page, name)
        await openHistory(page)

        await page.setViewportSize(PHONE)
        await expect(visible(page, 'reconcile-history-cards')).toBeVisible()
        await pickHistoryAccount(page, accountId)
        await expect(historyRow(page, id)).toBeVisible()

        await visible(page, `reconcile-history-more-${id}`).click()
        await expect(visible(page, `reconcile-history-menu-report-${id}`)).toBeVisible()
        await expect(visible(page, `reconcile-history-undo-${id}`)).toBeVisible()
        await visible(page, `reconcile-history-undo-${id}`).click()
        const sheet = visible(page, 'reconcile-undo-dialog')
        await expect(sheet).toBeVisible()
        await expect(sheet.getByTestId('reconcile-undo-text')).toContainText(
            'Its 1 transaction is no longer reconciled'
        )

        await sheet.getByTestId('reconcile-undo-submit').click()
        await expect(page).toHaveURL(summaryUrlOf(id))
        await visibleScreen(page, 'reconcile-screen')
        await expect(visible(page, 'reconcile-result')).toHaveText(
            'The reconciliation is in progress again. Its 1 transaction stays cleared.'
        )
    })
})
