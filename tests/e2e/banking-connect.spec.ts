import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    BANKING_DESKTOP,
    BANKING_PHONE,
    bankCard,
    bankCards,
    connectionIdOf,
    createBankTestAccount,
    openBanking,
    selectedCard,
} from './banking-helpers'
import { isDisabled } from './record-form-helpers'

// Each writing test connects its own number-less Bank account and disconnects it before it
// ends, so the seeded connections (1000, 2100) and the unconnected 1010 stay as seeded.

const KEEPS = 'The account, its balance and its journal entries stay in Books.'
const STEPS = [
    'Connect a bank or credit card account from your chart of accounts.',
    "Sign in to your bank's website and export a statement as CSV, OFX, QFX or QBO.",
    'Upload the file here. Books keeps it until you import its transactions.',
]

function menuItem(page: Page, name: string) {
    return page.getByRole('menuitem', { name, exact: true })
}

// Every POST that creates a bank connection, from now on.
function connectionPosts(page: Page) {
    const posts: string[] = []
    page.on('request', request => {
        if (
            request.method() === 'POST' &&
            request.url().includes('/api/collections/books_bank_connections/records')
        ) {
            posts.push(request.url())
        }
    })
    return posts
}

test.describe('bank-connection: connect', () => {
    test('connects an account, edits its bank details and disconnects it', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        const name = await createBankTestAccount(page)
        await openBanking(page)
        const posts = connectionPosts(page)

        await page.getByTestId('bank-connect').click()
        const dialog = page.getByTestId('bank-connect-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('Connect a bank account', { exact: true })).toBeVisible()
        await expect(
            dialog.getByText('As it appears on your statement', { exact: true })
        ).toBeVisible()
        await expect(
            dialog.getByText('Helps you tell accounts at the same bank apart', { exact: true })
        ).toBeVisible()

        await page.getByTestId('bank-connect-submit').click()
        await expect(
            dialog.getByText('Choose the account to connect', { exact: true })
        ).toBeVisible()

        await page.getByTestId('bank-connect-mask').fill('55')
        await page.getByTestId('bank-connect-institution').fill('B'.repeat(101))
        await page.getByTestId('bank-connect-submit').click()
        await expect(
            dialog.getByText('Enter the last 4 digits, or leave this blank', { exact: true })
        ).toBeVisible()
        await expect(
            dialog.getByText('A bank name can have at most 100 characters', { exact: true })
        ).toBeVisible()
        expect(posts).toEqual([])

        await page.getByTestId('bank-connect-account').click()
        await expect(menuItem(page, name)).toBeVisible()
        await expect(menuItem(page, '1010 Business Savings')).toBeVisible()
        await expect(menuItem(page, '1000 Business Checking')).toHaveCount(0)
        await expect(menuItem(page, '2100 Company Card')).toHaveCount(0)
        await expect(menuItem(page, '6100 Rent')).toHaveCount(0)
        await menuItem(page, name).click()
        await page.getByTestId('bank-connect-institution').fill('First Test Bank')
        await page.getByTestId('bank-connect-mask').fill('1234')
        await page.getByTestId('bank-connect-submit').click()

        await expect(dialog).toHaveCount(0)
        await expect(page).toHaveURL(/[?&]account=[^&]+/)
        const card = bankCard(page, name)
        await expect(card).toHaveAttribute('aria-selected', 'true')
        await expect(card.getByText('First Test Bank ••1234', { exact: true })).toBeVisible()
        await expect(card.getByText('No files waiting', { exact: true })).toBeVisible()
        await expect(page.getByTestId('bank-panel-title')).toHaveText(name)
        await expect.poll(() => posts.length).toBe(1)
        const connectionId = await connectionIdOf(card)

        await page.getByTestId('bank-connect').click()
        await expect(dialog).toBeVisible()
        await page.getByTestId('bank-connect-account').click()
        await expect(menuItem(page, '1010 Business Savings')).toBeVisible()
        await expect(menuItem(page, name)).toHaveCount(0)
        await menuItem(page, '1010 Business Savings').click()
        await page.getByTestId('bank-connect-cancel').click()
        await expect(dialog).toHaveCount(0)
        expect(posts).toHaveLength(1)

        await page.getByTestId('bank-panel-more').click()
        await menuItem(page, 'Edit bank details').click()
        const details = page.getByTestId('bank-details-dialog')
        await expect(details).toBeVisible()
        await expect(details.getByText(`Bank details for ${name}`, { exact: true })).toBeVisible()
        await expect(page.getByTestId('bank-connect-account')).toHaveCount(0)
        await expect(page.getByTestId('bank-details-institution')).toHaveValue('First Test Bank')
        await page.getByTestId('bank-details-mask').fill('9876')
        await page.getByTestId('bank-details-save').click()
        await expect(details).toHaveCount(0)
        await expect(page.getByTestId('bank-panel-details')).toHaveText('First Test Bank ••9876')

        await page.getByTestId('bank-panel-more').click()
        await menuItem(page, 'Disconnect').click()
        const disconnect = page.getByTestId('bank-disconnect-dialog')
        await expect(disconnect).toBeVisible()
        await expect(disconnect.getByText(`Disconnect ${name}?`, { exact: true })).toBeVisible()
        await expect(disconnect.getByText(KEEPS, { exact: true })).toBeVisible()
        await page.getByTestId('bank-disconnect-dialog-confirm').click()

        await expect(disconnect).toHaveCount(0)
        await expect(bankCard(page, name)).toHaveCount(0)
        await expect(selectedCard(page)).toHaveCount(1)
        await expect(bankCards(page).first()).toHaveAttribute('aria-selected', 'true')
        await expect
            .poll(() => new URL(page.url()).searchParams.get('account'))
            .not.toBe(connectionId)
    })

    test("with no bank account, the introduction's Connect explains what to do", async ({
        page,
    }) => {
        // Realtime is off while the reads are faked: the other worker's tests create and
        // connect Bank accounts, and their realtime events would add rows past the fake.
        // The stream never opens, so no realtime POST is sent and saves stay available.
        await page.route('**/api/realtime*', route => route.abort())
        await page.route('**/api/collections/books_bank_connections/records*', route =>
            route.fulfill({
                json: { page: 1, perPage: 30, totalItems: 0, totalPages: 0, items: [] },
            })
        )
        await page.route('**/api/collections/books_accounts/records*', async route => {
            const response = await route.fetch()
            const body = await response.json()
            const items = (body.items ?? []).filter(
                (item: { type?: string }) => item.type !== 'bank' && item.type !== 'credit_card'
            )
            await route.fulfill({ response, json: { ...body, items } })
        })
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(BANKING_DESKTOP)
        await openBanking(page)

        const screen = page.getByTestId('banking-screen')
        await expect(screen.getByText('Banking', { exact: true })).toBeVisible()
        await expect(screen.getByLabel('Open help')).toBeVisible()
        const intro = page.getByTestId('bank-intro')
        await expect(
            intro.getByText('Bring in your bank transactions by file', { exact: true })
        ).toBeVisible()
        for (const [i, step] of STEPS.entries()) {
            await expect(intro.getByText(step, { exact: true })).toBeVisible()
            await expect(intro).toContainText(`${i + 1}${step}`)
        }
        await expect(page.getByTestId('bank-connect')).toHaveCount(0)

        await page.getByTestId('bank-intro-connect').click()
        const dialog = page.getByTestId('bank-connect-dialog')
        await expect(dialog).toBeVisible()
        await expect(page.getByTestId('bank-connect-none')).toHaveText(
            'Your chart of accounts has no bank or credit card account.'
        )
        await expect(page.getByTestId('bank-connect-account')).toHaveCount(0)
        await expect(page.getByTestId('bank-connect-institution')).toHaveCount(0)
        await expect(page.getByTestId('bank-connect-mask')).toHaveCount(0)
        expect(await isDisabled(page.getByTestId('bank-connect-submit'))).toBe(true)

        await page.getByTestId('bank-connect-open-chart').click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('account-search').filter({ visible: true })).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('Connect opens as a sheet', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await openBanking(page)
        await page.setViewportSize(BANKING_PHONE)

        await page.getByLabel('Connect account', { exact: true }).click()
        const dialog = page.getByTestId('bank-connect-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('Connect a bank account', { exact: true })).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByTestId('bank-connect-account')).toBeVisible()
        await expect(page.getByTestId('bank-connect-submit')).toBeInViewport()
        // Checked once the sheet has settled, so a focus that lands late is caught.
        await expect(page.getByTestId('bank-connect-account')).not.toBeFocused()

        await page.getByTestId('bank-connect-cancel').click()
        await expect(dialog).toHaveCount(0)
    })
})
