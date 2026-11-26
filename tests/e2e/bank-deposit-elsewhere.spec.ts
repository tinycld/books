import { existsSync, readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, signInAsCollaborator } from '@tinycld/core/e2e-helpers'
import { DESKTOP, PHONE } from './account-register-helpers'
import {
    openBooks,
    openDepositBySearch,
    openNewDeposit,
    postOpenDeposit,
    postUndepositedEntry,
    postUndepositedPayment,
    postUndepositedReceipt,
    SEEDED_DEPOSIT,
    shownDeposit,
    tickDepositItemWithText,
    uniqueReference,
} from './bank-deposit-helpers'
import { collaboratorLevel, type Level, setCollaboratorLevel } from './books-access-helpers'
import { uniqueMemo } from './invoice-helpers'
import { openEntriesList, settleFrames } from './journal-entries-helpers'
import { newActionTestId } from './new-menu-helpers'
import { PAYMENT_URL } from './receive-payment-helpers'
import { expectRecordUrl, recordIdFromUrl } from './record-key-helpers'
import { openSalesReceiptBySearch, SALES_RECEIPT_URL } from './sales-receipt-helpers'

// A deposited document elsewhere in Books (bank deposit spec §3.10): the read view of a
// payment or a sales receipt that a posted deposit holds shows "In Deposit <n>" with a link
// and the reason, and offers no Edit or Void (nor their keys E and V); a journal entry with
// a deposited line shows the server's refusal when its Void is confirmed; once the deposit is
// void, the document offers Edit and Void again. The help topic opens from a new deposit.
// A read-only collaborator on the seeded deposit gets View journal entry only.
//
// Each writer test posts its own record (a sales receipt, a payment or a journal entry) to
// Undeposited funds, dated today, with a per-run reference no. and memo, and deposits only
// that row. The tests are independent, so each one names the behaviour that broke. No seeded
// item is posted and the seeded deposit is only read.
//
// Not driven here: a vendor refund's and a refund receipt's notice (the same InDepositNotice
// and read-action rule as the payment and the sales receipt, covered by
// tests/payment-read-actions.test.ts and tests/document-actions.test.ts); the Edit-save
// refusal of a journal entry (the same server guard as its Void, server/deposit_guard_test.go).

const IN_DEPOSIT_REASON = (noun: string) =>
    `To edit or void this ${noun}, remove it from the deposit first.`

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The first heading of the help topic, read from its file (the topic this checkpoint adds).
function firstHelpHeading(): string {
    const file = new URL('../../help/bank-deposits.md', import.meta.url)
    if (!existsSync(file)) return '(help/bank-deposits.md does not exist)'
    const heading = /^#{1,3} (.+)$/m.exec(readFileSync(file, 'utf8'))?.[1]
    return heading?.trim() ?? '(help/bank-deposits.md has no heading)'
}

// The page scrolls sideways when its content is wider than the viewport.
function pageOverflow(page: Page) {
    return page.evaluate(() => {
        const root = document.scrollingElement ?? document.documentElement
        return root.scrollWidth - root.clientWidth
    })
}

// Books must be open. Posts a sales receipt by check to Undeposited funds and returns its
// reference no., memo and id. Leaves the page on the receipt's read view.
async function postOwnReceipt(page: Page) {
    const reference = uniqueReference('DR')
    const memo = uniqueMemo('Deposited receipt')
    await postUndepositedReceipt(page, { reference, memo, amount: '140.00' })
    const id = await recordIdFromUrl(page, 'sales-receipts')
    return { reference, memo, id }
}

// Books must be open. Deposits the one own item whose Payment text is `itemText` and
// returns the deposit and the item's journal line id. Leaves the page on the deposit's read
// view. It first goes back to the Journal Entries list with the posted record's own Back, so
// the record's read view leaves the stack: a hidden copy under the deposit would make a
// later search for the record match two screens.
async function depositOnly(page: Page, itemText: string) {
    await openEntriesList(page)
    await openNewDeposit(page)
    const line = await tickDepositItemWithText(page, itemText)
    const deposit = await postOpenDeposit(page, uniqueMemo('Deposit elsewhere'))
    return { line, deposit }
}

test.describe('bank-deposit: elsewhere', () => {
    test('a deposited sales receipt offers no Edit or Void and links to the deposit', async ({
        page,
    }) => {
        await openBooks(page)

        // Setup: an own sales receipt on 1200, deposited alone.
        const receipt = await postOwnReceipt(page)
        const { line: receiptLine, deposit } = await depositOnly(
            page,
            `Check · ${receipt.reference}`
        )

        // The sales receipt: the notice, no Edit or Void, View journal entry stays.
        await shownDeposit(page, `deposit-item-link-${receiptLine}`).click()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(shownDeposit(page, 'sales-receipt-read-only')).toBeVisible()
        await expectRecordUrl(page, 'sales-receipts', await recordIdFromUrl(page, 'sales-receipts'))
        const receiptUrl = page.url()
        const notice = shownDeposit(page, 'in-deposit-notice')
        await expect(notice).toContainText(`In Deposit ${deposit.number}`)
        await expect(notice).toContainText(IN_DEPOSIT_REASON('sales receipt'))
        await expect(shownDeposit(page, 'in-deposit-link')).toHaveText(
            `In Deposit ${deposit.number}`
        )
        await expect(shownDeposit(page, 'sales-receipt-read-entry')).toBeVisible()
        await expect(shownDeposit(page, 'sales-receipt-read-edit')).toHaveCount(0)
        await expect(shownDeposit(page, 'sales-receipt-read-void')).toHaveCount(0)

        // E and V do nothing: the page and the URL stay, no dialog opens.
        await page.keyboard.press('e')
        await settleFrames(page)
        expect(page.url()).toBe(receiptUrl)
        await page.keyboard.press('v')
        await settleFrames(page)
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        expect(page.url()).toBe(receiptUrl)
        await expect(shownDeposit(page, 'sales-receipt-read-only')).toBeVisible()
        await expect(notice).toBeVisible()

        // At 390×844 the notice wraps inside the page, with no sideways scroll.
        await page.setViewportSize(PHONE)
        await expect(notice).toBeVisible()
        await expect
            .poll(async () => {
                const box = await notice.boundingBox()
                return box ? box.x >= 0 && box.x + box.width <= PHONE.width : false
            })
            .toBe(true)
        await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(0)
        await page.setViewportSize(DESKTOP)
        await expect(shownDeposit(page, 'sales-receipt-read-entry')).toBeVisible()

        // The link opens the deposit.
        await shownDeposit(page, 'in-deposit-link').click()
        await expectRecordUrl(page, 'deposits', deposit.id)
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()
    })

    test('a deposited payment offers no Edit or Void and names this payment', async ({ page }) => {
        await openBooks(page)

        // Setup: an own payment on 1200, deposited alone.
        const paymentRef = uniqueReference('DP')
        await postUndepositedPayment(page, {
            reference: paymentRef,
            memo: uniqueMemo('Deposited payment'),
            amount: '250.00',
        })
        const { line: paymentLine, deposit } = await depositOnly(page, `Check · ${paymentRef}`)

        // The payment: the notice with "this payment", no Edit or Void.
        await shownDeposit(page, `deposit-item-link-${paymentLine}`).click()
        await expect(page).toHaveURL(PAYMENT_URL)
        await expect(shownDeposit(page, 'payment-read-only')).toBeVisible()
        const paymentNotice = shownDeposit(page, 'in-deposit-notice')
        await expect(paymentNotice).toContainText(`In Deposit ${deposit.number}`)
        await expect(paymentNotice).toContainText(IN_DEPOSIT_REASON('payment'))
        await expect(shownDeposit(page, 'payment-read-entry')).toBeVisible()
        await expect(shownDeposit(page, 'payment-read-edit')).toHaveCount(0)
        await expect(shownDeposit(page, 'payment-read-void')).toHaveCount(0)
    })

    test('a journal entry with a deposited line shows the server refusal of its Void', async ({
        page,
    }) => {
        await openBooks(page)

        // Setup: an own journal entry line on 1200, deposited alone.
        const entryLineMemo = uniqueReference('DJ')
        const entry = await postUndepositedEntry(page, {
            memo: uniqueMemo('Deposited entry'),
            lineMemo: entryLineMemo,
            amount: '75.00',
        })
        const { line: entryLine, deposit } = await depositOnly(page, entryLineMemo)

        // The journal entry: Void is offered, and the server refuses it in the dialog.
        await shownDeposit(page, `deposit-item-link-${entryLine}`).click()
        await expectRecordUrl(page, 'entries', entry.id)
        await expect(shownDeposit(page, 'entry-read-only')).toBeVisible()
        await shownDeposit(page, 'entry-actions')
            .getByRole('button', { name: 'Void', exact: true })
            .click()
        const voidDialog = page.getByTestId('void-dialog')
        await expect(voidDialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(voidDialog.getByTestId('entry-error-summary')).toContainText(
            new RegExp(
                `is in Deposit ${escapeRegExp(deposit.number)}\\. Remove it from the deposit first`
            )
        )
        await voidDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(voidDialog).toHaveCount(0)
        await expect(shownDeposit(page, 'entry-badge')).toHaveText('Posted')
    })

    test('a void of the deposit gives its sales receipt Edit and Void again', async ({ page }) => {
        await openBooks(page)
        const receipt = await postOwnReceipt(page)
        const { line: receiptLine, deposit } = await depositOnly(
            page,
            `Check · ${receipt.reference}`
        )

        // While deposited, the receipt offers no Edit or Void.
        await shownDeposit(page, `deposit-item-link-${receiptLine}`).click()
        await expectRecordUrl(page, 'sales-receipts', receipt.id)
        await expect(shownDeposit(page, 'in-deposit-notice')).toBeVisible()
        await expect(shownDeposit(page, 'sales-receipt-read-edit')).toHaveCount(0)
        await expect(shownDeposit(page, 'sales-receipt-read-void')).toHaveCount(0)

        // The deposit is voided: the sales receipt offers Edit and Void again, with no notice.
        await shownDeposit(page, 'in-deposit-link').click()
        await expectRecordUrl(page, 'deposits', deposit.id)
        // V registers only once the read bar offers Void.
        const voidDialog = page.getByTestId('void-dialog')
        await expect(shownDeposit(page, 'deposit-read-void')).toBeVisible()
        await page.keyboard.press('v')
        await expect(voidDialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(voidDialog).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Void')
        await openSalesReceiptBySearch(page, receipt.memo)
        await expectRecordUrl(page, 'sales-receipts', receipt.id)
        await expect(shownDeposit(page, 'sales-receipt-read-edit')).toBeVisible()
        await expect(shownDeposit(page, 'sales-receipt-read-void')).toBeVisible()
        await expect(shownDeposit(page, 'in-deposit-notice')).toHaveCount(0)

        // The control for the E and V check of the first test: on a freed receipt the key V now
        // reaches the receipt and opens its Void dialog. Cancel keeps the receipt posted.
        await page.keyboard.press('v')
        await expect(voidDialog).toBeVisible()
        await voidDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(voidDialog).toHaveCount(0)
        await expect(shownDeposit(page, 'sales-receipt-badge')).toHaveText('Posted')
    })

    test('the help icon of a new deposit opens the topic Bank deposits', async ({ page }) => {
        await openBooks(page)
        await openNewDeposit(page)
        await shownDeposit(page, 'deposit-form').getByLabel('Open help').click()
        await expect(
            page.getByText('Bank deposits', { exact: true }).filter({ visible: true }).first()
        ).toBeVisible()
        await expect(
            page.getByText(firstHelpHeading(), { exact: true }).filter({ visible: true }).first()
        ).toBeVisible()
    })
})

const restore: { level: Level | undefined; closeReader: (() => Promise<void>) | undefined } = {
    level: undefined,
    closeReader: undefined,
}

test.describe('bank-deposit: reader (collaborator level)', () => {
    test.afterEach(async ({ page }) => {
        const { level, closeReader } = restore
        restore.level = undefined
        restore.closeReader = undefined
        if (closeReader) await closeReader()
        if (level !== undefined) await setCollaboratorLevel(page, level)
    })

    test('a read-only collaborator opens the seeded deposit with View journal entry only', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        restore.level = await collaboratorLevel(page)
        await setCollaboratorLevel(page, 'read_only')
        const reader = await signInAsCollaborator(page)
        restore.closeReader = reader.close
        const view = reader.page
        await navigateToPackage(view, 'books')
        await view.setViewportSize(DESKTOP)

        await openDepositBySearch(view, SEEDED_DEPOSIT.memo)
        await expect(shownDeposit(view, 'deposit-read-only')).toBeVisible()
        await expect(shownDeposit(view, 'deposit-read-entry')).toBeVisible()
        await expect(shownDeposit(view, 'deposit-read-void')).toHaveCount(0)
        await expect(shownDeposit(view, 'deposit-read-edit')).toHaveCount(0)

        // V opens no dialog.
        await view.keyboard.press('v')
        await settleFrames(view)
        await expect(view.getByTestId('void-dialog')).toHaveCount(0)
        await expect(shownDeposit(view, 'deposit-read-only')).toBeVisible()

        // The deposit's one item, a sales receipt: the reader sees "In Deposit <n>" with its
        // link, but not the reason to remove it, since a reader can never edit or void.
        await shownDeposit(view, 'deposit-read-only')
            .locator('[data-testid^="deposit-item-link-"]')
            .filter({ visible: true })
            .click()
        await expect(view).toHaveURL(SALES_RECEIPT_URL)
        await expect(shownDeposit(view, 'sales-receipt-read-only')).toBeVisible()
        const notice = shownDeposit(view, 'in-deposit-notice')
        await expect(notice).toBeVisible()
        await expect(notice.getByTestId('in-deposit-link')).toBeVisible()
        await expect(notice.getByTestId('in-deposit-link')).toHaveText(/^In Deposit \S+$/)
        await expect(notice.getByText(IN_DEPOSIT_REASON('sales receipt'))).toHaveCount(0)
        await view.goBack()
        await expect(shownDeposit(view, 'deposit-read-only')).toBeVisible()

        // A reader has no New section: no fold button and no Bank deposit action. The
        // sidebar itself is drawn.
        await shownDeposit(view, 'deposit-back').click()
        await expect(view.getByTestId('entries-screen').filter({ visible: true })).toBeVisible()
        await expect(view.getByTestId('books-nav-lists').filter({ visible: true })).toBeVisible()
        await expect(view.getByTestId('books-sidebar-new-toggle')).toHaveCount(0)
        await expect(view.getByTestId(newActionTestId('deposit'))).toHaveCount(0)
    })
})
