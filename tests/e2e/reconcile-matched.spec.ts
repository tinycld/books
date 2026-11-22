import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    inBanking,
    openMatchDrawer,
    postMatchTransfer,
    signInWide,
    todayDigits,
} from './bank-match-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import { importReviewStatement } from './for-review-helpers'
import { ACCOUNT_LABELS } from './journal-entries-helpers'
import {
    accountIdOf,
    daysAgo,
    lineBox,
    lineRow,
    openReconcile,
    postDatedEntry,
} from './reconcile-helpers'
import { visibleScreen } from './screen-helpers'
import { uniqueMemo } from './transfer-helpers'

// Reconcile spec §3 "Toolbar" (Clear matched), "The list (wide)" (the matched mark) and
// "The start dialog" (the values of the latest statement file). The test connects its own
// number-less bank account, imports one OFX file whose ledger balance is the account's
// balance after the one transfer it matches, and matches that transfer in the drawer, as
// tests/e2e/bank-match.spec.ts does. A deposit of its own stays unmatched.

// A second page of the same browser context, signed in as a reader: openOtherBooksPage
// signs in before a route can be installed, and fakeReadOnlyAccess must come before login.
async function openReaderPage(page: Page): Promise<Page> {
    const reader = await page.context().newPage()
    await fakeReadOnlyAccess(reader)
    await login(reader)
    await navigateToPackage(reader, 'books')
    const size = page.viewportSize()
    if (size) await reader.setViewportSize(size)
    return reader
}

test.describe('reconcile: clear matched', () => {
    test('clear matched: the start dialog takes the file’s balance, M clears only the matched row', async ({
        page,
    }) => {
        await signInWide(page)
        const bankRow = (stamp: string) => `${stamp} reconcile matched`
        const imported = await importReviewStatement(
            page,
            stamp => [{ day: todayDigits(), amount: '-161.10', name: bankRow(stamp) }],
            { amount: '-161.10', day: todayDigits() }
        )
        const { accountName, stamp, fileName } = imported
        const transferMemo = uniqueMemo('reconcile matched transfer')
        await postMatchTransfer(page, accountName, '161.10', transferMemo)
        await openMatchDrawer(page, bankRow(stamp))
        await page.getByTestId('bank-match-submit').click()
        await expect(await inBanking(page, 'bank-review-result')).toHaveText(
            'Matched 1 transaction.'
        )
        const depositMemo = uniqueMemo('reconcile unmatched deposit')
        await postDatedEntry(page, {
            memo: depositMemo,
            amount: '40.00',
            debitAccount: accountName,
            creditAccount: ACCOUNT_LABELS.equity,
            date: daysAgo(0),
        })

        // The start dialog opens with the file's balance and day.
        await openReconcile(page)
        const id = await accountIdOf(page, accountName)
        await page.getByTestId(`reconcile-start-${id}`).filter({ visible: true }).click()
        const dialog = page.getByTestId('reconcile-start-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('reconcile-ending-balance')).toHaveValue('-161.10')
        await expect(dialog.getByTestId('reconcile-ending-date')).toHaveValue(daysAgo(0))
        await expect(dialog).toContainText(`From ${fileName}. Check them against your statement.`)
        await dialog.getByTestId('reconcile-start-submit').click()
        await expect(page).toHaveURL(/\/books\/reconcile\/[a-z0-9]{15}\/?$/)
        const work = await visibleScreen(page, 'reconcile-screen')

        const matched = lineRow(page, transferMemo)
        const unmatched = lineRow(page, depositMemo)
        await expect(matched.getByLabel('Matched to a bank transaction')).toBeVisible()
        await expect(unmatched.getByLabel('Matched to a bank transaction')).toHaveCount(0)
        const clearMatched = work.getByTestId('reconcile-clear-matched')
        await expect(clearMatched).toContainText('Clear matched (1)')
        await expect(lineBox(page, transferMemo)).toHaveAttribute('aria-checked', 'false')
        await expect(lineBox(page, depositMemo)).toHaveAttribute('aria-checked', 'false')

        // A reader on the same work screen sees the matched mark but no Clear matched.
        const reader = await openReaderPage(page)
        await openReconcile(reader)
        const view = reader.getByTestId(`reconcile-view-${id}`).filter({ visible: true })
        await expect(view).toBeVisible()
        await view.click()
        await expect(reader).toHaveURL(new RegExp(`${new URL(page.url()).pathname}/?$`))
        const readerWork = await visibleScreen(reader, 'reconcile-screen')
        await expect(
            lineRow(reader, transferMemo).getByLabel('Matched to a bank transaction')
        ).toBeVisible()
        await expect(readerWork.getByTestId('reconcile-clear-matched')).toHaveCount(0)
        await reader.close()
        await page.bringToFront()

        await page.keyboard.press('m')
        await expect(lineBox(page, transferMemo)).toHaveAttribute('aria-checked', 'true')
        await expect(lineBox(page, depositMemo)).toHaveAttribute('aria-checked', 'false')
        await expect(clearMatched).toHaveCount(0)
    })
})
