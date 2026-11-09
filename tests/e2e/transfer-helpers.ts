import { expect, type Page } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { isPhone } from './account-register-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'

export { DESKTOP, isPhone, PHONE } from './account-register-helpers'

// The seeded accounts the seeded transfer moves money between, as the screens name them.
export const TRANSFER_LABELS = {
    checking: '1000 Business Checking',
    savings: '1010 Business Savings',
}

// A transfer's own screen: `books/transfers/<id>`, never `books/transfers/new`.
export const TRANSFER_URL = /\/books\/transfers\/(?!new$)[^/?#]+$/

const ENTRY_ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

export type TransferInput = { from: string; to: string; amount: string; memo: string }

// Navigate at the default viewport (the desktop rail), then size the page.
export async function startTransfers(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
}

// The DB is shared by every spec file, so each row a spec makes carries its own memo.
export function uniqueMemo(label: string): string {
    return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// From the Journal Entries list through the New menu (the phone FAB, or the desktop
// header's New text).
export async function openNewTransfer(page: Page) {
    await openEntriesList(page)
    if (isPhone(page)) {
        await page.getByLabel('New', { exact: true }).click()
    } else {
        await page.getByText('New', { exact: true }).filter({ visible: true }).click()
    }
    await page.getByTestId('books-new-transfer').click()
    await expect(page.getByTestId('transfer-title')).toHaveText('New transfer')
}

// Core SelectInput: the menu items exist only while the menu is open.
export async function chooseTransferAccount(page: Page, side: 'from' | 'to', label: string) {
    const trigger = page.getByTestId(`transfer-${side}`)
    await trigger.click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await expect(trigger).toHaveText(label)
}

export async function fillTransfer(page: Page, input: TransferInput) {
    await chooseTransferAccount(page, 'from', input.from)
    await chooseTransferAccount(page, 'to', input.to)
    const amount = page.getByTestId('transfer-amount-input')
    await amount.fill(input.amount)
    await amount.blur()
    await page.getByTestId('transfer-memo').fill(input.memo)
}

export function transferIdFromUrl(page: Page): string {
    const match = /\/books\/transfers\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id || id === 'new') throw new Error(`Not on a saved transfer: ${page.url()}`)
    return id
}

// Books must already be open. Leaves the page on the posted transfer's read view, once the
// server's number has arrived (the optimistic view shows no number). With no `date` the
// transfer keeps the form's default day (today).
export async function createPostedTransfer(
    page: Page,
    input: TransferInput,
    date?: string
): Promise<{ id: string; number: string }> {
    await openNewTransfer(page)
    await fillTransfer(page, input)
    if (date) await page.getByTestId('transfer-date').fill(date)
    await page.getByTestId('transfer-post').click()
    await expect(page.getByTestId('transfer-read-only')).toBeVisible()
    const title = page.getByTestId('transfer-title')
    await expect(title).toHaveText(/^Transfer TR-\d+$/)
    await expect(page).toHaveURL(TRANSFER_URL)
    const number = (await title.innerText()).trim().replace(/^Transfer /, '')
    return { id: transferIdFromUrl(page), number }
}

// Books must already be open. Leaves the page on the saved draft's form.
export async function saveTransferDraft(page: Page, input: TransferInput): Promise<string> {
    await openNewTransfer(page)
    await fillTransfer(page, input)
    await page.getByTestId('transfer-save-draft').click()
    await expect(page).toHaveURL(TRANSFER_URL)
    await expect(page.getByTestId('transfer-title')).toHaveText('Draft transfer')
    return transferIdFromUrl(page)
}

// The Journal Entries list is windowed, so a transfer is found through the search box.
export async function openTransferFromList(page: Page, memo: string) {
    await openEntriesList(page)
    await searchEntries(page, memo)
    const row = page
        .locator(ENTRY_ROWS)
        .filter({ hasText: memo })
        .filter({ hasNotText: /reversal/i })
    await expect(row).toHaveCount(1)
    await row.click()
    await expect(page).toHaveURL(TRANSFER_URL)
}
