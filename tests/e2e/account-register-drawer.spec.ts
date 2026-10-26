import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP, openRegister, PHONE, REGISTER_SEED } from './account-register-helpers'

// Journal entry creation has no UI until `p1-journal-entries`, so the register
// has nothing it can create through the UI. The entries it reads are posted by
// `seed.ts` through the server's posting hook (dated relative to today, so the
// spec never depends on the calendar). That is the seeded-fixture exception:
// the interaction under test (reading the register, opening the entry drawer)
// is driven through the UI; only the pre-existing ledger state is seeded. The
// spec writes nothing. It does not cover a draft entry in the drawer (a
// register only lists posted lines), a negative running balance, or the
// Escape key (not a closing path in this unit). All data is read through the UI.

const MONEY = /^-?\$[\d,]+\.\d{2}$/
const CARDS = '[data-testid^="register-card-"]'
const ROWS = '[data-testid^="register-row-"]'
const LINES = '[data-testid^="register-drawer-line-"]'
const ACCENT = /(^|\s)bg-accent(\s|$)/
const TABLET = { width: 900, height: 1000 }
const DESKTOP_TALL = { width: 1280, height: 900 }

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
    const box = await locator.boundingBox()
    if (!box) throw new Error('element has no layout box')
    return box
}

async function openChecking(page: Page, size: { width: number; height: number }) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(size)
    await openRegister(page, 'Business Checking')
    await page.getByTestId('register-range').click()
    await page.getByRole('menuitem', { name: 'This fiscal year', exact: true }).click()
    await expect(page.getByTestId('register-range')).toContainText('This fiscal year')
}

function cardByMemo(page: Page, memo: string) {
    return page.locator(CARDS).filter({ hasText: memo })
}

function rowByMemo(page: Page, memo: string) {
    return page.locator(ROWS).filter({ hasText: memo })
}

function drawer(page: Page) {
    return page.getByTestId('register-entry-drawer')
}

test.describe('account-register: cards and drawer', () => {
    test('phone: the register lists cards and a card opens its entry in the bottom drawer', async ({
        page,
    }) => {
        await openChecking(page, PHONE)

        await expect(page.locator(CARDS).first()).toBeVisible()
        await expect(page.locator(ROWS)).toHaveCount(0)
        const cards = page.locator(CARDS)
        expect(await cards.count()).toBeGreaterThan(3)

        const sale = cardByMemo(page, REGISTER_SEED.sale)
        await expect(sale).toHaveCount(1)
        await expect(sale).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)
        const saleId = ((await sale.getAttribute('data-testid')) ?? '').replace(
            'register-card-',
            ''
        )
        await expect(page.getByTestId(`register-ref-${saleId}`)).toHaveText(/\S/)
        await expect(sale).toContainText('Accounts receivable')
        await expect(sale).toContainText('Debit')
        await expect(sale).toContainText('Journal entry')
        const money = sale.getByText(MONEY)
        await expect(money).toHaveCount(2)
        await expect(money.first()).toHaveText('$1,250.00')

        await expect(cardByMemo(page, REGISTER_SEED.split)).toContainText('-Split-')
        await expect(cardByMemo(page, REGISTER_SEED.voidOriginal)).toContainText('Void')
        await expect(page.locator(CARDS).filter({ hasText: 'Void reversal of' })).not.toHaveCount(0)

        const opening = page.getByTestId('register-opening-card')
        await expect(opening).toBeVisible()
        await expect(opening.getByText(MONEY)).toHaveCount(1)
        await expect(opening).not.toContainText('Debit')
        await expect(opening).not.toContainText('Credit')
        expect((await boxOf(opening)).y).toBeGreaterThan((await boxOf(cards.last())).y)

        const split = cardByMemo(page, REGISTER_SEED.split)
        await split.click()
        const panel = drawer(page)
        await expect(panel).toBeVisible()
        await expect(split).toHaveClass(ACCENT)
        await expect(panel).toHaveCount(1)
        await expect(page.getByRole('dialog', { name: /Entry/ })).toBeVisible()
        await expect(page.getByTestId('register-drawer-field-date')).toContainText(
            /[A-Z][a-z]{2} \d{1,2}, \d{4}/
        )
        const number = (await page.getByTestId('register-drawer-field-number').innerText())
            .replace(/^\s*(Number|Ref no\.)\s*/i, '')
            .trim()
        expect(number).not.toBe('')
        expect(number).not.toBe('Draft')
        await expect(page.getByTestId('register-drawer-field-type')).toContainText('Journal entry')
        await expect(page.getByTestId('register-drawer-field-status')).toContainText('Posted')
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.split
        )

        const lines = page.locator(LINES)
        await expect(lines).toHaveCount(3)
        const checking = lines.filter({ hasText: 'Business Checking' })
        const rent = lines.filter({ hasText: 'Rent' })
        const software = lines.filter({ hasText: 'Software Subscriptions' })
        await expect(checking.getByText('$300.00', { exact: true })).toHaveCount(1)
        await expect(rent.getByText('$200.00', { exact: true })).toHaveCount(1)
        await expect(software.getByText('$100.00', { exact: true })).toHaveCount(1)
        await expect(checking).toHaveClass(ACCENT)
        await expect(rent).not.toHaveClass(ACCENT)
        await expect(software).not.toHaveClass(ACCENT)

        await page.getByTestId('register-drawer-close').click()
        await expect(panel).not.toBeVisible()
        await expect.poll(() => panel.count()).toBe(0)
        await expect(split).not.toHaveClass(ACCENT)

        await cardByMemo(page, REGISTER_SEED.voidOriginal).click()
        await expect(page.getByTestId('register-drawer-field-status')).toContainText('Void')
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.voidOriginal
        )

        // The phone drawer is modal: its backdrop and focus trap keep a card behind it from
        // being pressed, so the next card is opened after closing, and must show its own entry.
        await page.getByTestId('register-drawer-close').click()
        await expect(panel).not.toBeVisible()
        await sale.click()
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.sale
        )
        await expect(page.getByTestId('register-drawer-field-status')).toContainText('Posted')
        await expect(panel).toHaveCount(1)
    })

    test('desktop: the inline drawer shows the clicked or keyed row and closes on range change', async ({
        page,
    }) => {
        await openChecking(page, DESKTOP_TALL)
        const sale = rowByMemo(page, REGISTER_SEED.sale)
        const memo = page.getByTestId('register-drawer-field-memo')
        await sale.click()

        const panel = drawer(page)
        await expect(panel).toBeVisible()
        await expect(sale).toHaveClass(ACCENT)
        await expect(panel).toHaveCount(1)
        await expect(page.getByRole('complementary', { name: /Entry/ })).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByTestId('register-drawer-backdrop')).toHaveCount(0)
        await expect(memo).toContainText(REGISTER_SEED.sale)
        await expect(page.locator(LINES)).toHaveCount(2)

        // Inline, nothing covers the table, so another row replaces the open entry.
        await rowByMemo(page, REGISTER_SEED.split).click()
        await expect(memo).toContainText(REGISTER_SEED.split)
        await expect(page.locator(LINES)).toHaveCount(3)
        await sale.click()
        await expect(memo).toContainText(REGISTER_SEED.sale)

        await page.getByTestId('register-drawer-close').click()
        await expect(panel).not.toBeVisible()
        await expect.poll(() => panel.count()).toBe(0)
        await expect(sale).not.toHaveClass(ACCENT)

        await sale.focus()
        await page.keyboard.press('Enter')
        await expect(panel).toBeVisible()
        await expect(memo).toContainText(REGISTER_SEED.sale)
        await page.getByTestId('register-drawer-close').click()
        await expect(panel).not.toBeVisible()

        await rowByMemo(page, REGISTER_SEED.split).focus()
        await page.keyboard.press('Space')
        await expect(panel).toBeVisible()
        await expect(memo).toContainText(REGISTER_SEED.split)

        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'Last fiscal year', exact: true }).click()
        await expect(page.getByTestId('register-range')).toContainText('Last fiscal year')
        await expect(page.getByTestId('register-empty-range')).toBeVisible()

        await page.getByTestId('register-range').click()
        await page.getByRole('menuitem', { name: 'This fiscal year', exact: true }).click()
        await expect(sale).toBeVisible()
        await expect.poll(() => panel.count()).toBe(0)
        await expect(page.locator(`${ROWS}.bg-accent`)).toHaveCount(0)
    })

    test('tablet: the drawer is an overlay with a backdrop', async ({ page }) => {
        await openChecking(page, TABLET)
        await expect(page.getByTestId('register-table')).toBeVisible()
        await rowByMemo(page, REGISTER_SEED.sale).click()

        await expect(drawer(page)).toBeVisible()
        await expect(page.getByRole('dialog', { name: /Entry/ })).toBeVisible()
        await expect(page.getByTestId('register-drawer-backdrop')).toBeVisible()
    })

    test('desktop: an open entry does not follow you to another register or back', async ({
        page,
    }) => {
        await openChecking(page, DESKTOP)
        await rowByMemo(page, REGISTER_SEED.sale).click()
        await expect(drawer(page)).toBeVisible()
        await expect(page.getByTestId('register-drawer-field-memo')).toContainText(
            REGISTER_SEED.sale
        )

        await openRegister(page, 'Accounts receivable')
        await expect(page.getByTestId('register-title')).toContainText('Accounts receivable')
        await expect(drawer(page)).toHaveCount(0)

        await openRegister(page, 'Business Checking')
        await expect(page.getByTestId('register-title')).toContainText('Business Checking')
        await expect(page.locator(ROWS).first()).toBeVisible()
        await expect.poll(() => drawer(page).count()).toBe(0)
        await expect(page.locator(`${ROWS}.bg-accent`)).toHaveCount(0)
    })
})
