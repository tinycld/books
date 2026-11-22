import { existsSync, readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, signInAsCollaborator } from '@tinycld/core/e2e-helpers'
import { DESKTOP, PHONE } from './account-register-helpers'
import {
    depositUrlOf,
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
import { settleFrames } from './journal-entries-helpers'
import { PAYMENT_URL } from './receive-payment-helpers'
import { openSalesReceiptBySearch, SALES_RECEIPT_URL } from './sales-receipt-helpers'

// A deposited document elsewhere in Books (bank deposit spec §3.10): the read view of a
// payment or a sales receipt that a posted deposit holds shows "In Deposit <n>" with a link
// and the reason, and offers no Edit or Void (nor their keys E and V); a journal entry with
// a deposited line shows the server's refusal when its Void is confirmed; once the deposit is
// void, the document offers Edit and Void again. The help topic opens from a new deposit.
// A read-only collaborator on the seeded deposit gets View journal entry only.
//
// Each writer test posts its own sales receipt, payment and journal entry to Undeposited
// funds, dated today, with a per-run reference no. and memo, and deposits only those rows.
// No seeded item is posted and the seeded deposit is only read.
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

test.describe('bank-deposit: elsewhere', () => {
    test('a deposited sales receipt and payment offer no Edit or Void and link to the deposit; the deposit void frees them', async ({
        page,
    }) => {
        await openBooks(page)

        // Setup: an own payment, sales receipt and journal entry line on 1200, deposited
        // together.
        const paymentRef = uniqueReference('DP')
        await postUndepositedPayment(page, {
            reference: paymentRef,
            memo: uniqueMemo('Deposited payment'),
            amount: '250.00',
        })
        const receiptRef = uniqueReference('DR')
        const receiptMemo = uniqueMemo('Deposited receipt')
        await postUndepositedReceipt(page, {
            reference: receiptRef,
            memo: receiptMemo,
            amount: '140.00',
        })
        const receiptId = /\/books\/sales-receipts\/([^/?#]+)$/.exec(
            new URL(page.url()).pathname
        )?.[1]
        if (!receiptId) throw new Error(`not on the sales receipt: ${page.url()}`)
        const entryLineMemo = uniqueReference('DJ')
        const entry = await postUndepositedEntry(page, {
            memo: uniqueMemo('Deposited entry'),
            lineMemo: entryLineMemo,
            amount: '75.00',
        })

        await openNewDeposit(page)
        const receiptLine = await tickDepositItemWithText(page, `Check · ${receiptRef}`)
        const paymentLine = await tickDepositItemWithText(page, `Check · ${paymentRef}`)
        const entryLine = await tickDepositItemWithText(page, entryLineMemo)
        const depositMemo = uniqueMemo('Deposit elsewhere')
        const deposit = await postOpenDeposit(page, depositMemo)

        // The sales receipt: the notice, no Edit or Void, View journal entry stays.
        await shownDeposit(page, `deposit-item-link-${receiptLine}`).click()
        await expect(page).toHaveURL(SALES_RECEIPT_URL)
        await expect(shownDeposit(page, 'sales-receipt-read-only')).toBeVisible()
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
        await expect(page).toHaveURL(depositUrlOf(deposit.id))
        await expect(shownDeposit(page, 'deposit-read-only')).toBeVisible()

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

        // The journal entry: Void is offered, and the server refuses it in the dialog.
        await openDepositBySearch(page, depositMemo)
        await shownDeposit(page, `deposit-item-link-${entryLine}`).click()
        await expect(page).toHaveURL(new RegExp(`/books/entries/${entry.id}$`))
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

        // The deposit is voided: the sales receipt offers Edit and Void again, with no notice.
        await openDepositBySearch(page, depositMemo)
        await expect(page).toHaveURL(depositUrlOf(deposit.id))
        // V registers only once the read bar offers Void.
        await expect(shownDeposit(page, 'deposit-read-void')).toBeVisible()
        await page.keyboard.press('v')
        await expect(voidDialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(voidDialog).toHaveCount(0)
        await expect(shownDeposit(page, 'deposit-badge')).toHaveText('Void')
        await openSalesReceiptBySearch(page, receiptMemo)
        await expect(page).toHaveURL(new RegExp(`/books/sales-receipts/${receiptId}$`))
        await expect(shownDeposit(page, 'sales-receipt-read-edit')).toBeVisible()
        await expect(shownDeposit(page, 'sales-receipt-read-void')).toBeVisible()
        await expect(shownDeposit(page, 'in-deposit-notice')).toHaveCount(0)

        // The control for the E and V check above: on this same read view the key V now
        // reaches the receipt and opens its Void dialog. Cancel keeps the receipt posted.
        await page.keyboard.press('v')
        await expect(voidDialog).toBeVisible()
        await voidDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(voidDialog).toHaveCount(0)
        await expect(shownDeposit(page, 'sales-receipt-badge')).toHaveText('Posted')

        // Last: the help icon of a new deposit opens the topic "Bank deposits".
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

        // + New is hidden for a reader.
        await shownDeposit(view, 'deposit-back').click()
        await expect(view.getByTestId('entries-screen').filter({ visible: true })).toBeVisible()
        await expect(view.getByText('New', { exact: true }).filter({ visible: true })).toHaveCount(
            0
        )
    })
})
