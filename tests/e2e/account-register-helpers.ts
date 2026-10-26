import { expect, type Locator, type Page } from '@playwright/test'

// Shared by the account-register e2e specs.
//
// Journal entry creation has no UI until `p1-journal-entries`, so the register
// has nothing it can create through the UI. The entries the register reads are
// posted by `seed.ts` through the server's posting hook (dated relative to
// today, so no spec depends on the calendar). That is the seeded-fixture
// exception: the interaction under test (reading and navigating the register)
// is driven through the UI; only the pre-existing ledger state is seeded.

export const DESKTOP = { width: 1280, height: 800 }
export const PHONE = { width: 390, height: 844 }

// Memos of the entries seed.ts posts on Business Checking (checkpoint 3, Do 2).
export const REGISTER_SEED = {
    sale: 'Register sale',
    split: 'Register split payment',
    fiscalYearStart: 'Register fiscal year start',
    voidOriginal: 'Register void original',
    corrected: 'Register corrected',
} as const

export function isPhone(page: Page) {
    return (page.viewportSize()?.width ?? DESKTOP.width) < 700
}

// A row on wide screens, a card on phones.
export function accountItem(page: Page, name: string): Locator {
    const prefix = isPhone(page) ? 'account-card-' : 'account-row-'
    return page.locator(`[data-testid^="${prefix}"]`).filter({ hasText: name })
}

async function revealInactive(page: Page) {
    if (isPhone(page)) {
        await page.getByTestId('account-filter-button').click()
        await page.getByTestId('account-show-inactive').click()
        await page.keyboard.press('Escape')
        return
    }
    await page.getByTestId('account-show-inactive').click()
}

// Opens the Chart of Accounts: from a register through its back link, on a
// phone through the Lists card, on desktop through the Books sidebar.
export async function openChart(page: Page) {
    const back = page.getByTestId('register-back')
    const landing = isPhone(page)
        ? page.getByTestId('books-list-card-accounts')
        : page.getByTestId('books-nav-accounting-toggle')
    // A fresh page restores the last route (lastPackageHref), which can be an entry screen
    // that has neither a register back link nor the hub card on a phone.
    const entryBack = page.getByTestId('entry-back')
    await entryBack.or(back).or(landing).first().waitFor({ state: 'attached' })
    if (await entryBack.isVisible()) {
        await entryBack.click()
        const list = page.getByTestId('entries-screen')
        await back.or(landing).or(list).first().waitFor({ state: 'attached' })
        // On a phone the entries list has no way up to the Lists hub, and the tab bar restores
        // the last route, so route to the hub in-app (no page load) the way the not-found spec does.
        if (isPhone(page) && (await list.isVisible())) {
            await page.evaluate(url => {
                window.history.pushState({}, '', url)
                window.dispatchEvent(new PopStateEvent('popstate'))
            }, '/a/books/lists')
            await landing.waitFor({ state: 'visible' })
        }
    }
    if (await back.isVisible()) {
        await back.click()
    } else if (isPhone(page)) {
        await page.getByTestId('books-list-card-accounts').click()
    } else {
        const item = page.getByTestId('books-nav-accounts')
        const toggle = page.getByTestId('books-nav-accounting-toggle')
        await toggle.waitFor({ state: 'attached' })
        if (!(await item.isVisible())) await toggle.click()
        await item.click()
    }
    await expect(page.getByTestId('account-search')).toBeVisible()
}

// The Chart of Accounts must already be open. Chooses "View register" from the
// account's row or card menu.
export async function chooseViewRegister(page: Page, accountName: string) {
    if ((await accountItem(page, accountName).count()) === 0) await revealInactive(page)
    const item = accountItem(page, accountName)
    await item.locator('[data-testid^="account-menu-"]').click()
    await page.getByRole('menuitem', { name: 'View register', exact: true }).click()
}

export async function openRegister(page: Page, accountName: string) {
    await openChart(page)
    await chooseViewRegister(page, accountName)
}

// The Chart of Accounts must already be open. Creates a number-less Income account
// through the account panel.
export async function createIncomeAccount(page: Page, name: string) {
    await page.getByTestId(isPhone(page) ? 'account-new-header' : 'account-new-toolbar').click()
    const panel = page.getByTestId('account-panel')
    await expect(panel).toBeVisible()
    await page.getByLabel('Account name').fill(name)
    await panel.getByTestId('account-type').click()
    await page.getByRole('menuitem', { name: 'Income', exact: true }).click()
    await panel.getByTestId('account-detail-type').click()
    await page.getByRole('menuitem', { name: 'Service income', exact: true }).click()
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(accountItem(page, name)).toBeVisible()
}
