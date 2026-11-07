import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    BANKING_DESKTOP,
    bankCard,
    createBankTestAccount,
    fakeReadOnlyAccess,
    openBanking,
    openFilesTab,
    statementFile,
} from './banking-helpers'

// The writer test connects its own number-less Bank account, uploads one file with unique
// bytes, removes it and disconnects the account before it ends. The reader tests fake a
// read-only books_access answer and write nothing.

const CHECKING = '1000 Business Checking'
const CARD = '2100 Company Card'
const SEED_FILE = 'checking-2026-09.csv'
const CARD_FILE = 'card-2026-10.ofx'

function shortcutList(page: Page): Locator {
    return page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
}

function menuItem(page: Page, name: string) {
    return page.getByRole('menuitem', { name, exact: true })
}

function fileRow(page: Page, name: string): Locator {
    return page
        .getByTestId('bank-files')
        .locator(
            '[data-testid^="bank-file-"]:not([data-testid^="bank-file-remove-"]):not([data-testid^="bank-file-import-"])'
        )
        .filter({ has: page.getByText(name, { exact: true }) })
}

async function fileIdOf(row: Locator): Promise<string> {
    await expect(row).toHaveCount(1)
    const testId = (await row.getAttribute('data-testid')) ?? ''
    return testId.slice('bank-file-'.length)
}

async function openMoreItem(page: Page, name: string) {
    await page.getByTestId('bank-panel-more').click()
    await menuItem(page, name).click()
}

test.describe('bank-connection: keys', () => {
    test('N, U and ⌘↵ drive Banking from the keyboard', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        const name = await createBankTestAccount(page)
        await openBanking(page)

        // Core's list shows the page keys under the Banking group; Escape closes only it.
        await page.keyboard.press('Shift+?')
        const list = shortcutList(page)
        await expect(list).toBeVisible()
        const group = list.getByText('Banking', { exact: true }).locator('..')
        await expect(group.getByText('Connect account', { exact: true })).toBeVisible()
        await expect(group.getByText('Choose file', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)

        const connect = page.getByTestId('bank-connect-dialog')
        const account = page.getByTestId('bank-connect-account')
        await page.keyboard.press('n')
        await expect(connect).toBeVisible()
        await expect(account).toBeFocused()

        // Inside the dialog the list shows the dialog's own keys: the layer's Close (Esc)
        // and ⌘↵ Connect, and none of the page keys.
        await page.keyboard.press('Shift+?')
        await expect(list).toBeVisible()
        await expect(list.getByText('Close', { exact: true })).toBeVisible()
        await expect(group.getByText('Connect', { exact: true })).toBeVisible()
        await expect(list.getByText('Connect account', { exact: true })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)
        await expect(connect).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(connect).toHaveCount(0)

        await page.keyboard.press('n')
        await expect(connect).toBeVisible()
        await expect(account).toBeFocused()
        await page.keyboard.press('Enter')
        await menuItem(page, name).click()
        const institution = page.getByTestId('bank-connect-institution')
        await institution.click()
        await page.keyboard.type('Key Bank')
        await expect(institution).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(connect).toHaveCount(0)
        const card = bankCard(page, name)
        await expect(card).toHaveAttribute('aria-selected', 'true')
        await expect(card.getByText('Key Bank', { exact: true })).toBeVisible()

        await openFilesTab(page)
        const file = statementFile(`keys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.keyboard.press('u'),
        ])
        await chooser.setFiles(file)
        await expect(page.getByTestId('bank-upload-done')).toHaveText(`${file.name} uploaded.`)
        const row = fileRow(page, file.name)
        const fileId = await fileIdOf(row)

        const remove = page.getByTestId('bank-remove-dialog')
        await page.getByTestId(`bank-file-remove-${fileId}`).click()
        await expect(remove).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(remove).toHaveCount(0)
        await expect(row).toHaveCount(1)
        await page.getByTestId(`bank-file-remove-${fileId}`).click()
        await expect(remove).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(remove).toHaveCount(0)
        await expect(page.getByTestId(`bank-file-${fileId}`)).toHaveCount(0)

        const details = page.getByTestId('bank-details-dialog')
        await openMoreItem(page, 'Edit bank details')
        await expect(details).toBeVisible()
        await expect(page.getByTestId('bank-details-institution')).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(details).toHaveCount(0)
        await expect(page.getByTestId('bank-panel-details')).toHaveText('Key Bank')

        await openMoreItem(page, 'Edit bank details')
        await expect(details).toBeVisible()
        const mask = page.getByTestId('bank-details-mask')
        await mask.click()
        await page.keyboard.type('4321')
        await expect(mask).toBeFocused()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(details).toHaveCount(0)
        await expect(page.getByTestId('bank-panel-details')).toHaveText('Key Bank ••4321')

        const disconnect = page.getByTestId('bank-disconnect-dialog')
        await openMoreItem(page, 'Disconnect')
        await expect(disconnect).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(disconnect).toHaveCount(0)
        await expect(card).toHaveCount(1)
        await openMoreItem(page, 'Disconnect')
        await expect(disconnect).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(disconnect).toHaveCount(0)
        await expect(card).toHaveCount(0)
    })

    test('a read-only user gets no Connect, upload, Remove, menu or keys', async ({ page }) => {
        await fakeReadOnlyAccess(page)
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        await openBanking(page)

        const checking = bankCard(page, CHECKING)
        await expect(checking).toBeVisible()
        await checking.click()
        await expect(checking).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('bank-panel-title')).toHaveText(CHECKING)
        await expect(page.getByTestId('bank-view-register')).toBeVisible()
        await expect(page.getByTestId('bank-panel-more')).toHaveCount(0)
        await openFilesTab(page)
        await expect(page.getByTestId('bank-file-drop')).toHaveCount(0)
        await expect(page.getByTestId('bank-connect')).toHaveCount(0)
        await expect(page.getByTestId('bank-files')).toContainText(SEED_FILE)
        await expect(page.locator('[data-testid^="bank-file-remove-"]')).toHaveCount(0)

        await bankCard(page, CARD).click()
        await expect(fileRow(page, CARD_FILE)).toHaveCount(1)
        await expect(page.locator('[data-testid^="bank-file-import-"]')).toHaveCount(0)

        // The shortcut list opening after n proves the page read the keys in order.
        await page.keyboard.press('n')
        await page.keyboard.press('Shift+?')
        const list = shortcutList(page)
        await expect(list).toBeVisible()
        await expect(page.getByTestId('bank-connect-dialog')).toHaveCount(0)
        await expect(list.getByText('Connect account', { exact: true })).toHaveCount(0)
        await expect(list.getByText('Choose file', { exact: true })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('a read-only user with no connection sees the introduction without its button', async ({
        page,
    }) => {
        await fakeReadOnlyAccess(page)
        await page.route('**/api/collections/books_bank_connections/records*', route =>
            route.fulfill({
                json: { page: 1, perPage: 30, totalItems: 0, totalPages: 0, items: [] },
            })
        )
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        await openBanking(page)

        const intro = page.getByTestId('bank-intro')
        await expect(
            intro.getByText('Bring in your bank transactions by file', { exact: true })
        ).toBeVisible()
        await expect(
            intro.getByText(
                'No bank accounts are connected yet. A bookkeeper or an admin can connect one.',
                { exact: true }
            )
        ).toBeVisible()
        await expect(page.getByTestId('bank-intro-connect')).toHaveCount(0)
        await expect(page.getByTestId('bank-connect')).toHaveCount(0)

        // The shortcut list opening after n proves the page read the keys in order.
        await page.keyboard.press('n')
        await page.keyboard.press('Shift+?')
        const list = shortcutList(page)
        await expect(list).toBeVisible()
        await expect(page.getByTestId('bank-connect-dialog')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)
        await page.unrouteAll({ behavior: 'wait' })
    })
})
