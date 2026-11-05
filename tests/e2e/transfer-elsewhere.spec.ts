import { expect, type Page, test } from '@playwright/test'
import { openRegister, revealRegisterItem } from './account-register-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import {
    chooseTransferAccount,
    createPostedTransfer,
    DESKTOP,
    PHONE,
    startTransfers,
    TRANSFER_LABELS,
    uniqueMemo,
} from './transfer-helpers'

// Where a transfer starts and is edited from outside its own screens: the register's
// Transfer button (with Post & new keeping the register account), and Edit from the Journal
// Entries list and from the journal entry view. Every transfer is made by driving the form
// (never a raw PocketBase write) and carries a unique memo, found through `entries-search`
// or `revealRegisterItem`, because the DB is shared by every spec file on two workers. Every
// transfer posted here takes From = 1010 Business Savings (account-register-table.spec.ts
// relies on Business Checking never going below zero) and keeps the default date, today, so
// nothing is posted before mid-2026 (books-settings.spec.ts holds close date 2026-06-30 for a
// few seconds). No balance, fiscal month or close date is assumed.
//
// The register test runs at phone size only: there Post & new sits in the `transfer-more`
// menu and the register draws cards. The opening-balance Edit is not driven: no
// opening-balance entry is guaranteed on the shared DB (`entryEditHref` is unit-tested). A
// reader's register (no Transfer button) is not driven: the e2e book has no non-writer Books
// user (`transferButtonVisible` is unit-tested).

const REGISTER_CARDS = '[data-testid^="register-card-"]'

function accountIdFromUrl(page: Page): string {
    const match = /\/books\/accounts\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id) throw new Error(`Not on a register: ${page.url()}`)
    return id
}

test.describe('transfer: entry points', () => {
    test('starts a transfer from a register and keeps the account through Post & new', async ({
        page,
    }) => {
        await startTransfers(page, PHONE)
        await openRegister(page, 'Business Savings')
        await expect(page).toHaveURL(/\/books\/accounts\/[^/?#]+$/)
        const accountId = accountIdFromUrl(page)
        const registerUrl = new RegExp(`/books/accounts/${accountId}$`)
        const fromUrl = new RegExp(`/books/transfers/new\\?from=${accountId}$`)

        const button = page.getByTestId('register-new-transfer')
        await expect(button).toHaveText('Transfer')
        await button.click()
        await expect(page).toHaveURL(fromUrl)
        await expect(page.getByTestId('transfer-from')).toHaveText(TRANSFER_LABELS.savings)
        await expect(page.getByTestId('transfer-balance-from')).toHaveText(/^Balance /)
        await expect(page.getByTestId('transfer-post-new')).toBeHidden()

        const memo = uniqueMemo('Register transfer')
        await chooseTransferAccount(page, 'to', TRANSFER_LABELS.checking)
        const amount = page.getByTestId('transfer-amount-input')
        await amount.fill('5')
        await amount.blur()
        const memoInput = page.getByTestId('transfer-memo')
        await memoInput.fill(memo)

        await page.getByTestId('transfer-more').click()
        await page.getByTestId('transfer-post-new').click()
        await expect(page).toHaveURL(fromUrl)
        await expect(page.getByTestId('transfer-title')).toHaveText('New transfer')
        await expect(amount).toHaveValue('')
        await expect(memoInput).toHaveValue('')
        await expect(page.getByTestId('transfer-from')).toHaveText(TRANSFER_LABELS.savings)

        await page.getByTestId('transfer-cancel').click()
        await expect(page).toHaveURL(registerUrl)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(page.getByTestId('register-title')).toContainText('Business Savings')
        const card = page.locator(REGISTER_CARDS).filter({ hasText: memo })
        await revealRegisterItem(page, card)
        await expect(card).toBeVisible()
    })

    test('edits a transfer from the Journal Entries list and from its journal entry', async ({
        page,
    }) => {
        await startTransfers(page, DESKTOP)
        const memo = uniqueMemo('Entry point transfer')
        const { id, number } = await createPostedTransfer(page, {
            from: TRANSFER_LABELS.savings,
            to: TRANSFER_LABELS.checking,
            amount: '6.00',
            memo,
        })
        const editUrl = new RegExp(`/books/transfers/new\\?replaces=${id}$`)

        await page.getByTestId('transfer-view-entry').click()
        await expect(page).toHaveURL(new RegExp(`/books/entries/${id}$`))
        await expect(page.getByTestId('entry-detail-type')).toContainText('Transfer')
        const actions = page.getByTestId('entry-actions')
        await expect(actions.getByText('Edit', { exact: true })).toBeVisible()
        await expect(actions.getByText('Void', { exact: true })).toBeVisible()
        await expect(actions.getByText('Reverse', { exact: true })).toHaveCount(0)

        await page.getByTestId('entry-edit').click()
        await expect(page).toHaveURL(editUrl)
        await expect(page.getByTestId('transfer-title')).toHaveText(`Edit ${number}`)
        await page.getByTestId('transfer-cancel').click()
        await expect(page).not.toHaveURL(editUrl)

        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${id}`)).toHaveText('Transfer')
        await expect(page.getByTestId(`entries-cell-number-${id}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${id}`).click()
        await expect(page.getByTestId('entries-menu-open')).toBeVisible()
        await expect(page.getByTestId('entries-menu-edit')).toBeVisible()
        await expect(page.getByTestId('entries-menu-void')).toBeVisible()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-edit').click()
        await expect(page).toHaveURL(editUrl)
    })
})
