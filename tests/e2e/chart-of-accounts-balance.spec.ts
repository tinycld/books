import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    accountItem,
    chooseViewRegister,
    createIncomeAccount,
    DESKTOP,
    openChart,
} from './account-register-helpers'
import { ACCOUNT_LABELS, createPostedEntry } from './journal-entries-helpers'

// The Chart of Accounts shows each account's balance from the ledger, and the
// register derives its ending balance from the same posted lines. The account
// and its two entries are created through the UI (account panel, journal entry
// form), so the expected figure is known and no other spec posts to it. The
// account is left in place: an account with posted lines is part of the ledger.

const MONEY = /-?\$[\d,]+\.\d{2}/

async function openEntriesFromSidebar(page: Page) {
    const item = page.getByTestId('books-nav-entries')
    const toggle = page.getByTestId('books-nav-accounting-toggle')
    await expect(toggle).toBeVisible()
    if (!(await item.isVisible())) await toggle.click()
    await item.click()
    await expect(page.getByTestId('entries-screen')).toBeVisible()
}

test.describe('chart-of-accounts: balance matches the register', () => {
    test("an account's chart balance equals its register ending balance", async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(DESKTOP)
        const name = `E2E Balance ${Date.now()}`
        await openChart(page)
        await createIncomeAccount(page, name)

        await openEntriesFromSidebar(page)
        await createPostedEntry(page, {
            memo: `${name} first`,
            amount: '120.50',
            debitAccount: ACCOUNT_LABELS.equity,
            creditAccount: name,
        })
        await createPostedEntry(page, {
            memo: `${name} second`,
            amount: '30.25',
            debitAccount: ACCOUNT_LABELS.equity,
            creditAccount: name,
        })

        await openChart(page)
        const row = accountItem(page, name)
        await expect(row).toContainText('$150.75')
        const chartBalance = (await row.innerText()).match(MONEY)?.[0]

        await chooseViewRegister(page, name)
        await expect(page.getByTestId('register-title')).toContainText(name)
        const ending = page.getByTestId('register-ending-balance')
        await expect(ending).toHaveText('$150.75')
        expect(chartBalance).toBe(await ending.innerText())
    })
})
