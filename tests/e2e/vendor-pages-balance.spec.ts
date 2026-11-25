import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { BILL_URL } from './bill-helpers'
import { uniqueMemo } from './invoice-helpers'
import { localDay, vendorWithBills } from './pay-bills-helpers'
import { holdLoads, sideBySide } from './record-form-helpers'
import { codeRouteKeys, expectRecordUrl } from './record-key-helpers'
import { creditCellTestId, pickCreditLineAccount, VENDOR_CREDIT_URL } from './vendor-credit-helpers'
import {
    createVendor,
    DESKTOP,
    discardDialog,
    field,
    isDisabled,
    openBooks,
    openNewVendor,
    openVendorId,
    openVendorsList,
    PHONE,
    searchVendors,
    stacked,
    uniqueName,
    vendorEntry,
    vendorPath,
} from './vendor-form-helpers'
import { REFUND_CREDIT_ACCOUNT } from './vendor-refund-helpers'

// The vendor page's Open and Overdue figures and its New transaction menu (vendor-pages
// checkpoint 4, spec §3.1–§3.4, §3.7 and §3.9). Every test creates its own vendors with
// unique names; bills and vendor credits are posted through their forms, dated on or after
// 2026-07-01. No seeded row is changed.
//
// Not covered here: a read-only user (no New transaction) cannot be driven, because the e2e
// seed has no read-only Books member (as customer-form-actions.spec.ts says); the reader
// rules are pinned by the `vendorPageControls` unit test (tests/vendor-page-tabs.test.ts)
// and the `canWrite` flag of the shared parts. The phone tab strip scrolling the selected
// tab into view is checked at gate 2 only. Swipe back and the hardware back are native
// only; the same `useLeaveGuard` call that holds the browser Back button holds them. The
// menu's items and their hrefs are pinned by tests/transaction-actions.test.ts.

const BALANCES_URL = '**/api/collections/books_party_balances/records**'
const MENU_ITEMS = [
    'vendor-new-bill',
    'vendor-new-pay-bills',
    'vendor-new-expense',
    'vendor-new-vendor-credit',
    'vendor-new-vendor-refund',
]
const INACTIVE_HINT = 'Make this vendor active to add transactions.'

function figures(page: Page) {
    return {
        open: page.getByTestId('vendor-balance-open'),
        openLabel: page.getByTestId('vendor-balance-open-label'),
        overdue: page.getByTestId('vendor-balance-overdue'),
        error: page.getByTestId('vendor-balance-error'),
        retry: page.getByTestId('vendor-balance-retry'),
    }
}

// The New transaction menu's items in screen order.
function menuItemIds(page: Page) {
    return page
        .locator(MENU_ITEMS.map(id => `[data-testid="${id}"]`).join(', '))
        .evaluateAll(els => els.map(el => el.getAttribute('data-testid')))
}

function refusal(route: Route) {
    return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
    })
}

function refusedResponse(page: Page, collection: string) {
    return page.waitForResponse(
        r => r.url().includes(`/api/collections/${collection}/records`) && r.status() === 400
    )
}

// From the list: the vendor's row opens its page.
async function openFromRow(page: Page, name: string) {
    await openVendorsList(page)
    await searchVendors(page, name)
    await vendorEntry(page, name).click()
    await expect(page.getByTestId('vendor-title')).toHaveText(name)
}

// Back from a pushed document to the vendor page kept under it.
async function backToVendor(page: Page, id: string) {
    await page.goBack()
    await expect(page).toHaveURL(await vendorPath(page, id))
    await expect(page.getByTestId('vendor-title')).toBeVisible()
}

// The header's New transaction menu → one item.
async function chooseNew(page: Page, item: string) {
    await page.getByTestId('vendor-new-transaction').click()
    await page.getByTestId(item).click()
}

async function widthOf(locator: Locator) {
    return Math.round((await locator.boundingBox())?.width ?? 0)
}

// The More button sits to the right of the title, its top above or level with the
// title's top (1 px for rounding).
async function moreBesideTitle(page: Page) {
    const [title, more] = await Promise.all([
        page.getByTestId('vendor-title').boundingBox(),
        page.getByTestId('vendor-more').boundingBox(),
    ])
    if (!title || !more) return false
    return more.x >= title.x + title.width - 1 && more.y <= title.y + 1
}

test.describe('vendor-pages: vendor balance', () => {
    test('Open and Overdue follow posted bills and a void with no reload', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { open, openLabel, overdue } = figures(page)

        // Past due, due today, due later.
        const { vendor, bills } = await vendorWithBills(page, {
            name: uniqueName('Vendor balance bills'),
            bills: [
                { amount: '100.00', due: await localDay(page, -5) },
                { amount: '200.00', due: await localDay(page, 0) },
                { amount: '400.00', due: await localDay(page, 10) },
            ],
        })
        const [pastDue] = bills
        await openFromRow(page, vendor.name)
        await expect(open).toHaveText('$700.00')
        await expect(openLabel).toHaveText('Open')
        await expect(overdue).toHaveText('$100.00')

        // The past-due bill voided on its own screen: Overdue $0.00, Open moves by $100.00.
        await page.getByTestId(`vendor-transaction-${pastDue.id}`).click()
        await expectRecordUrl(page, 'bills', pastDue.id)
        await expect(page).toHaveURL(BILL_URL)
        // The wide read bar shows Void itself (a phone bar keeps it in More).
        await expect(page.getByTestId('bill-read-only')).toBeVisible()
        await page.getByTestId('bill-read-void').click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('bill-badge')).toHaveText('Void')
        await backToVendor(page, vendor.id)
        await expect(overdue).toHaveText('$0.00')
        await expect(open).toHaveText('$600.00')
        await expect(openLabel).toHaveText('Open')
    })

    test('a vendor credit above the open bills turns Open into Credit with no reload', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { open, openLabel, overdue } = figures(page)
        const { vendor } = await vendorWithBills(page, {
            name: uniqueName('Vendor balance credit'),
            bills: [
                { amount: '100.00', due: await localDay(page, -5) },
                { amount: '200.00', due: await localDay(page, 10) },
            ],
        })
        await openFromRow(page, vendor.name)
        await expect(open).toHaveText('$300.00')
        await expect(overdue).toHaveText('$100.00')

        // A vendor credit above the bills, from the page's own menu: Credit. Overdue keeps
        // the past-due bill, as the credit is not applied to it.
        await chooseNew(page, 'vendor-new-vendor-credit')
        await expect(page).toHaveURL(new RegExp(`/books/vendor-credits/new\\?vendor=${vendor.id}$`))
        await expect(page.getByTestId('form-input-vendor')).toContainText(vendor.name)
        const line = await pickCreditLineAccount(page, 0, REFUND_CREDIT_ACCOUNT)
        await page.getByTestId(creditCellTestId('account_lines', line, 'amount')).fill('1000.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Vendor balance credit'))
        await page.getByTestId('vendor-credit-post').click()
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        await expect(page.getByTestId('vendor-credit-read-only')).toBeVisible()
        await backToVendor(page, vendor.id)
        await expect(open).toHaveText('−$700.00')
        await expect(openLabel).toHaveText('Credit')
        await expect(overdue).toHaveText('$100.00')
    })

    test('the balance shows loading, an error with Retry, and the hint for an inactive vendor', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { open, overdue, error, retry } = figures(page)
        const prefix = uniqueName('Vendor balance load')
        const loadingName = `${prefix} A`
        const failingName = `${prefix} B`
        const newTransaction = page.getByTestId('vendor-new-transaction')
        const emptyNew = page.getByTestId('vendor-transactions-empty-new')

        // Both saved with Save and new: neither page has read its balance.
        await openNewVendor(page)
        for (const name of [loadingName, failingName]) {
            await field(page, 'display_name').fill(name)
            await page.getByTestId('vendor-save-new').click()
            await expect(field(page, 'display_name')).toHaveValue('')
            await expect(page.getByTestId('vendor-title')).toHaveText('New vendor')
        }

        // The balance read held: both figures "—"; released: $0.00.
        await openVendorsList(page)
        await searchVendors(page, loadingName)
        const balances = await holdLoads(page, BALANCES_URL)
        await vendorEntry(page, loadingName).click()
        await expect(page.getByTestId('vendor-title')).toHaveText(loadingName)
        await expect(open).toHaveText('—')
        await expect(overdue).toHaveText('—')
        await expect.poll(() => balances.held.length).toBeGreaterThan(0)
        await balances.release()
        await expect(open).toHaveText('$0.00')
        await expect(overdue).toHaveText('$0.00')

        // The balance read refused on its first load: Balance unavailable, then Retry.
        await openVendorsList(page)
        await searchVendors(page, failingName)
        await page.route(BALANCES_URL, refusal)
        const failed = refusedResponse(page, 'books_party_balances')
        await vendorEntry(page, failingName).click()
        await expect(page.getByTestId('vendor-title')).toHaveText(failingName)
        await failed
        await expect(error).toContainText('Balance unavailable')
        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(open).toHaveText('$0.00')
        await expect(overdue).toHaveText('$0.00')
        await expect(error).toHaveCount(0)

        // Inactive: New transaction disabled with its hint, ⌥N opens nothing, and the
        // empty state's button is disabled too.
        await page.getByTestId('vendor-more').click()
        await page.getByTestId('vendor-more-inactive').click()
        await expect(page.getByTestId('vendor-inactive-badge')).toBeVisible()
        await expect.poll(() => isDisabled(newTransaction)).toBe(true)
        await expect(page.getByTestId('vendor-new-transaction-hint')).toHaveText(INACTIVE_HINT)
        await expect(page.getByTestId('vendor-transactions-empty')).toBeVisible()
        await expect.poll(() => isDisabled(emptyNew)).toBe(true)
        await page.keyboard.press('Alt+n')
        await expect(page.getByTestId('vendor-new-bill')).toHaveCount(0)

        // Make active: both enabled, and ⌥N opens the menu.
        await page.getByTestId('vendor-more').click()
        await expect(page.getByTestId('vendor-more-inactive')).toHaveText('Make active')
        await page.getByTestId('vendor-more-inactive').click()
        await expect(page.getByTestId('vendor-inactive-badge')).toHaveCount(0)
        await expect.poll(() => isDisabled(newTransaction)).toBe(false)
        await expect.poll(() => isDisabled(emptyNew)).toBe(false)
        await expect(page.getByTestId('vendor-new-transaction-hint')).toHaveCount(0)
        await page.keyboard.press('Alt+n')
        await expect(page.getByTestId('vendor-new-bill')).toBeVisible()
    })

    test('New transaction opens each purchase form for this vendor, from the keyboard and from a dirty page', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Vendor new menu')
        const note = `${name} note`
        const notesInput = page.getByTestId('vendor-notes-input')
        const saveBar = page.getByTestId('vendor-save-bar')
        await createVendor(page, { name })
        const id = await openVendorId(page)

        // A new vendor opens on Transactions, with no tab param, at $0.00.
        const { open, openLabel, overdue } = figures(page)
        await expect(page).toHaveURL(
            new RegExp(`/books/vendors/${await codeRouteKeys(page, 'vendors', id)}$`)
        )
        await expect(page.getByTestId('vendor-tab-transactions')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(open).toHaveText('$0.00')
        await expect(openLabel).toHaveText('Open')
        await expect(overdue).toHaveText('$0.00')

        // Notes typed, the focus in the field: ⌥N opens the menu in NEW_ACTIONS order.
        await page.keyboard.press('Alt+4')
        await expect(page.getByTestId('vendor-tab-notes')).toHaveAttribute('aria-selected', 'true')
        await notesInput.click()
        await page.keyboard.type(note)
        await expect(saveBar).toBeVisible()
        await expect(notesInput).toBeFocused()
        await page.keyboard.press('Alt+n')
        await expect.poll(() => menuItemIds(page)).toEqual(MENU_ITEMS)
        await expect(page.getByTestId('vendor-new-bill')).toBeFocused()
        await page.keyboard.press('Enter')

        // The bill form for this vendor; no leave question, the notes being dirty.
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?vendor=${id}$`))
        await expect(page.getByTestId('form-input-vendor')).toContainText(name)
        await expect(discardDialog(page).title).toHaveCount(0)

        // Back: the typed notes and the save bar are still there.
        await backToVendor(page, id)
        await expect(notesInput).toHaveValue(note)
        await expect(saveBar).toBeVisible()

        // ⌥1 from the notes field selects Transactions (no tab param); ⌥4 the notes again.
        await notesInput.focus()
        await page.keyboard.press('Alt+1')
        await expect(page.getByTestId('vendor-tab-transactions')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(page).toHaveURL(
            new RegExp(`/books/vendors/${await codeRouteKeys(page, 'vendors', id)}$`)
        )
        await page.keyboard.press('Alt+4')
        await expect(notesInput).toHaveValue(note)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(saveBar).toBeHidden()

        // The bill form's Edit vendor opens this vendor's page on Details.
        await chooseNew(page, 'vendor-new-bill')
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?vendor=${id}$`))
        await page.getByTestId('bill-edit-vendor').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/vendors/${await codeRouteKeys(page, 'vendors', id)}\\?tab=details$`)
        )
        await expect(
            page.getByTestId('vendor-tab-details').filter({ visible: true })
        ).toHaveAttribute('aria-selected', 'true')
        await page.goBack()
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?vendor=${id}$`))
        await backToVendor(page, id)

        // Every other item opens its route for this vendor; Back returns to the page.
        for (const [item, route] of [
            ['vendor-new-pay-bills', 'pay-bills'],
            ['vendor-new-expense', 'expenses/new'],
            ['vendor-new-vendor-credit', 'vendor-credits/new'],
            ['vendor-new-vendor-refund', 'vendor-refunds/new'],
        ] as const) {
            await chooseNew(page, item)
            await expect(page).toHaveURL(new RegExp(`/books/${route}\\?vendor=${id}$`))
            await backToVendor(page, id)
        }
    })

    test('phone: the header stacks and New transaction is a sheet', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { open, overdue } = figures(page)
        const newTransaction = page.getByTestId('vendor-new-transaction')
        const { vendor, bills } = await vendorWithBills(page, {
            name: uniqueName('Vendor phone'),
            bills: [{ amount: '120.00', due: await localDay(page, 15) }],
        })
        await openFromRow(page, vendor.name)
        await page.setViewportSize(PHONE)

        // Name row with More, the figures side by side, then a full-width New transaction.
        await expect(page.getByTestId('vendor-title')).toBeVisible()
        await expect(open).toHaveText('$120.00')
        await expect(overdue).toHaveText('$0.00')
        await expect.poll(() => moreBesideTitle(page)).toBe(true)
        await expect.poll(() => sideBySide(open, overdue)).toBe(true)
        await expect.poll(() => stacked(page.getByTestId('vendor-title'), open)).toBe(true)
        await expect.poll(() => stacked(open, newTransaction)).toBe(true)
        await expect.poll(() => widthOf(newTransaction)).toBeGreaterThan(300)

        // The menu is a bottom sheet titled "New transaction" with the five items.
        await newTransaction.click()
        const sheet = page
            .locator('div')
            .filter({ has: page.getByTestId('sheet-handle') })
            .filter({ has: page.getByTestId('vendor-new-bill') })
            .last()
        await expect(sheet.getByText('New transaction', { exact: true })).toBeVisible()
        await expect.poll(() => menuItemIds(page)).toEqual(MENU_ITEMS)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('vendor-new-bill')).toHaveCount(0)

        // The Transactions tab draws cards; a bill's card opens the bill.
        await expect(page.getByTestId('vendor-transactions-cards')).toBeVisible()
        await expect(page.getByTestId('vendor-transactions-table')).toHaveCount(0)
        await page.getByTestId(`vendor-transaction-${bills[0].id}`).click()
        await expectRecordUrl(page, 'bills', bills[0].id)
    })
})
