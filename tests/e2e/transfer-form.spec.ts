import { expect, type Page, test } from '@playwright/test'
import { openEntriesList } from './journal-entries-helpers'
import {
    chooseTransferAccount,
    DESKTOP,
    fillTransfer,
    openNewTransfer,
    openTransferFromList,
    startTransfers,
    TRANSFER_LABELS,
    TRANSFER_URL,
    transferIdFromUrl,
    uniqueMemo,
} from './transfer-helpers'

// The transfer form: a new transfer from the New menu, validation before any write, and a
// saved draft that is left and posted later. Every transfer is made by driving the form
// (never a raw PocketBase write) and carries a unique memo, found through `entries-search`,
// because the DB is shared by every spec file on two workers. Every transfer posted here
// takes From = 1010 Business Savings (account-register-table.spec.ts relies on Business
// Checking never going below zero) and keeps the default date, today, so nothing is posted
// before mid-2026 (books-settings.spec.ts holds close date 2026-06-30 for a few seconds).
// No balance, fiscal month or close date is assumed: the overdraft amount is read from the
// screen.
//
// Desktop only: the form's phone path (More with Post & new) runs in the register test at
// phone size. It does not cover `transfer-no-access`: the e2e book has no non-writer Books
// user, so the screen's single `canWrite` gate is not drivable here.

const ENTRY_CREATE = '/api/collections/books_journal_entries/records'

function localToday(page: Page): Promise<string> {
    return page.evaluate(() => {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    })
}

// "Balance $1,201.00" / "Balance -$215.40" in cents.
function balanceCents(text: string): number {
    const match = /^Balance (-?)\$([\d,]+)\.(\d{2})$/.exec(text.trim())
    if (!match) throw new Error(`Not a balance line: ${text}`)
    const cents = Number(match[2].replace(/,/g, '')) * 100 + Number(match[3])
    return match[1] === '-' ? -cents : cents
}

function plainAmount(cents: number): string {
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

function usd(cents: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        cents / 100
    )
}

test.describe('transfer: form', () => {
    test('posts a new transfer from the New menu', async ({ page }) => {
        await startTransfers(page, DESKTOP)
        await openEntriesList(page)
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()

        const item = page.getByTestId('books-new-transfer')
        await expect(item).toHaveText('Transfer')
        await expect(
            page.getByTestId('books-new-journal-entry').locator('xpath=following-sibling::*[1]')
        ).toHaveAttribute('data-testid', 'books-new-transfer')
        await item.click()

        await expect(page).toHaveURL(/\/books\/transfers\/new$/)
        const form = page.getByTestId('transfer-form')
        await expect(page.getByTestId('transfer-title')).toHaveText('New transfer')

        // "Transfer from" has the focus when the form opens, with its menu closed: Enter
        // opens the menu, and Escape closes only the menu.
        const fromTrigger = page.getByTestId('transfer-from')
        await expect(fromTrigger).toBeFocused()
        await expect(page.getByRole('menuitem')).toHaveCount(0)
        await page.keyboard.press('Enter')
        await expect(
            page.getByRole('menuitem', { name: TRANSFER_LABELS.savings, exact: true })
        ).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menuitem')).toHaveCount(0)
        await expect(form).toBeVisible()
        await expect(page).toHaveURL(/\/books\/transfers\/new$/)

        // Core's shortcut list shows the form's keys under the Transfer group; Escape closes
        // only the list.
        await expect(fromTrigger).toBeFocused()
        await page.keyboard.press('Shift+?')
        const shortcutList = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(shortcutList).toBeVisible()
        const transferGroup = shortcutList.getByText('Transfer', { exact: true }).locator('..')
        await expect(transferGroup.getByText('Post', { exact: true })).toBeVisible()
        await expect(transferGroup.getByText('Post & new', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(shortcutList).toHaveCount(0)
        await expect(form).toBeVisible()
        await expect(page).toHaveURL(/\/books\/transfers\/new$/)

        await expect(page.getByTestId('transfer-badge')).toHaveText('Draft')
        await expect(page.getByTestId('transfer-amount')).toHaveText('—')
        await expect(page.getByTestId('transfer-date')).toHaveValue(await localToday(page))
        await expect(page.getByTestId('transfer-balance-from')).toHaveCount(0)
        for (const label of ['Transfer from', 'Transfer to', 'Amount', 'Date', 'Memo']) {
            await expect(form.getByText(label, { exact: true })).toBeVisible()
        }
        await expect(form.getByLabel('Open help')).toBeVisible()

        await page.getByTestId('transfer-from').click()
        const items = page.getByRole('menuitem')
        await expect(items.first()).toBeVisible()
        const offered = (await items.allInnerTexts()).map(text => text.trim())
        for (const label of [
            '1000 Business Checking',
            '1010 Business Savings',
            '1500 Office Equipment',
            '2100 Company Card',
            "3000 Owner's Equity",
        ]) {
            expect(offered).toContain(label)
        }
        for (const label of [
            '1100 Accounts receivable',
            '4000 Consulting Income',
            '6100 Rent',
            '6210 Design Tools',
            '6900 Old Petty Cash',
        ]) {
            expect(offered).not.toContain(label)
        }
        await page.getByRole('menuitem', { name: TRANSFER_LABELS.savings, exact: true }).click()
        await expect(page.getByTestId('transfer-from')).toHaveText(TRANSFER_LABELS.savings)
        const fromBalance = page.getByTestId('transfer-balance-from')
        await expect(fromBalance).toHaveText(/^Balance -?\$[\d,]+\.\d{2}$/)

        await chooseTransferAccount(page, 'to', TRANSFER_LABELS.checking)
        await expect(page.getByTestId('transfer-balance-to')).toBeVisible()

        // One hundred dollars past the From balance: an overdraft is allowed, and the sum
        // moved on the shared DB stays modest.
        const balance = balanceCents(await fromBalance.innerText())
        const amount = Math.max(balance, 0) + 10_000
        expect(amount).toBeGreaterThan(balance)
        const money = usd(amount)
        const amountInput = page.getByTestId('transfer-amount-input')
        await amountInput.fill(plainAmount(amount))
        await amountInput.blur()
        await expect(amountInput).toHaveValue(money)
        await expect(page.getByTestId('transfer-amount')).toHaveText(money)
        const memoInput = page.getByTestId('transfer-memo')
        await memoInput.fill(uniqueMemo('Overdraft transfer'))

        // ⌘↵ posts from the memo field that still has the focus.
        await expect(memoInput).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(TRANSFER_URL)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByTestId('transfer-error-summary')).toHaveCount(0)
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        await expect(page.getByTestId('transfer-title')).toHaveText(/^Transfer TR-\d+$/)
        await expect(page.getByTestId('transfer-read-from')).toHaveText(TRANSFER_LABELS.savings)
        await expect(page.getByTestId('transfer-read-to')).toHaveText(TRANSFER_LABELS.checking)
        await expect(page.getByTestId('transfer-amount')).toHaveText(money)
    })

    test('refuses invalid input before any write', async ({ page }) => {
        await startTransfers(page, DESKTOP)
        let creates = 0
        page.on('request', request => {
            if (request.method() === 'POST' && request.url().includes(ENTRY_CREATE)) creates += 1
        })
        await openNewTransfer(page)
        const form = page.getByTestId('transfer-form')
        const post = page.getByTestId('transfer-post')
        const message = (text: string) => form.getByText(text, { exact: true })

        await post.click()
        await expect(message('Choose the account the money comes from')).toBeVisible()
        await expect(message('Choose the account the money goes to')).toBeVisible()
        await expect(message('Enter an amount like 1,234.50')).toBeVisible()

        await chooseTransferAccount(page, 'from', TRANSFER_LABELS.checking)
        await chooseTransferAccount(page, 'to', TRANSFER_LABELS.checking)
        await expect(message('Choose two different accounts')).toBeVisible()
        await expect(message('Choose the account the money comes from')).toHaveCount(0)
        await chooseTransferAccount(page, 'to', TRANSFER_LABELS.savings)

        const amount = page.getByTestId('transfer-amount-input')
        await amount.fill('0')
        await post.click()
        await expect(message('Enter an amount more than 0')).toBeVisible()

        await amount.fill('20,000,000,000,000.00')
        await post.click()
        await expect(message('The amount is too large')).toBeVisible()
        await expect(page.getByTestId('transfer-amount')).toHaveText('Too large')

        await amount.fill('10')
        const date = page.getByTestId('transfer-date')
        await date.fill('2026-11-31')
        await post.click()
        await expect(message('Enter a date as YYYY-MM-DD')).toBeVisible()

        await date.fill(await localToday(page))
        await page.getByTestId('transfer-memo').fill('a'.repeat(4001))
        await page.getByTestId('transfer-save-draft').click()
        await expect(message('A memo can have at most 4000 characters')).toBeVisible()

        expect(creates).toBe(0)
        await expect(page).toHaveURL(/\/transfers\/new$/)
        await expect(page.getByTestId('transfer-error-summary')).toHaveCount(0)
    })

    test('saves a draft, asks before dropping edits, and posts it later', async ({ page }) => {
        await startTransfers(page, DESKTOP)
        const memo = uniqueMemo('Draft transfer')
        await openNewTransfer(page)
        await fillTransfer(page, {
            from: TRANSFER_LABELS.savings,
            to: TRANSFER_LABELS.checking,
            amount: '12.34',
            memo,
        })
        // ⌘S saves the draft from the memo field that fillTransfer filled last.
        const title = page.getByTestId('transfer-title')
        const memoInput = page.getByTestId('transfer-memo')
        await expect(memoInput).toBeFocused()
        await page.keyboard.press('ControlOrMeta+s')

        await expect(page).toHaveURL(TRANSFER_URL)
        const id = transferIdFromUrl(page)
        const draftUrl = new RegExp(`/books/transfers/${id}$`)
        await expect(title).toHaveText('Draft transfer')
        await expect(page.getByTestId('transfer-from')).toHaveText(TRANSFER_LABELS.savings)
        await expect(page.getByTestId('transfer-amount-input')).toHaveValue('$12.34')

        // Escape is Cancel: with an edit it asks first, and a second Escape closes only the
        // dialog.
        const changed = `${memo} changed`
        await memoInput.fill(changed)
        await expect(memoInput).toBeFocused()
        await page.keyboard.press('Escape')
        const dialog = page.getByTestId('discard-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('Discard changes?')
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('transfer-form')).toBeVisible()
        await expect(page).toHaveURL(draftUrl)
        await expect(memoInput).toHaveValue(changed)

        await page.getByTestId('transfer-cancel').click()
        await page.getByTestId('discard-confirm').click()
        await expect(page).not.toHaveURL(draftUrl)

        await openTransferFromList(page, memo)
        await expect(page).toHaveURL(draftUrl)
        await expect(page.getByTestId('transfer-title')).toHaveText('Draft transfer')
        await expect(page.getByTestId('transfer-memo')).toHaveValue(memo)
        await page.getByTestId('transfer-post').click()
        await expect(page.getByTestId('transfer-read-only')).toBeVisible()
        await expect(page.getByTestId('transfer-title')).toHaveText(/^Transfer TR-\d+$/)
        await expect(page).toHaveURL(draftUrl)
    })
})
