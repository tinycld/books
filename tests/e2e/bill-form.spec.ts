import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { BILL_REFUSALS } from '../../tinycld/books/lib/bill-form-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { PHONE } from './account-register-helpers'
import {
    accountLineRows,
    BILL_URL,
    billCellTestId,
    billIdFromUrl,
    billLineRowId,
    billNumberOf,
    itemLineRows,
    NEW_BILL_URL,
    openNewBill,
    pickBillLineProduct,
    pickBillVendor,
    pickLineAccount,
    postBill,
    reopenByBack,
} from './bill-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'

// The bill form and its read view (spec §3.1–§3.12), checkpoint 3. Every bill is made by
// driving the form with a unique memo (and a unique vendor's bill no. where the number
// matters); the spec never edits, posts, voids or deletes a seeded bill, vendor, product
// or account, never asserts a fixed bill number (the seed numbers through the same
// sequence) and posts every bill on the default date (today).
//
// The keyboard tests press no click after the form opens: focus starts in Vendor, Tab
// moves between fields, a picker opens by typing, ⌘S / ⌘↵ / ⌘⇧↵ / Esc / ⌘⌫ are Save draft
// / Post / Post & new / Cancel / Delete draft, ⌥↵ / ⌥P add an account / product line and
// the core row keys duplicate and remove the focused line.
//
// One phone test: the phone form is other code (the band stacks Vendor over Mailing
// address, each line is a card, and the bar moves Post & new and Delete draft into More).
// Not driven here: native-only behavior, loading, not-found, cannot-edit, offline and
// no-access (unit: tests/document-screen-state.test.ts), the reader's read view (unit:
// tests/document-actions.test.ts), the client zod rules (unit:
// tests/document-schema-bill.test.ts).

const SUMMIT = 'Summit IT Services'
const OFFICE_SUPPLY = 'Office Supply World'
const PACIFIC_POWER = 'Pacific Power'
const OFFICE_SUPPLY_LINE1 = '4120 Commerce Boulevard'
const ACCESS_POINT = 'Wireless access point'
const ACCESS_POINT_DESCRIPTION = 'Wi-Fi 6E access point, ceiling mount, PoE powered.'
// The delete dialog's title and body are separate elements.
const DELETE_TITLE = 'Delete this draft bill?'
const DELETE_BODY = "This can't be undone."
const REF_HINT = "The number on the vendor's bill"
const MEMO_HINT = 'Only your team sees this. Saved as the journal entry memo.'

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(cents / 100)
}

// A day `days` after an ISO day.
function addDays(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

function uniqueRef(label: string): string {
    return `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

const DRAFT_URL_OF = (id: string) => new RegExp(`/books/bills/${id}$`)

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

async function tabTo(page: Page, target: Locator) {
    await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
}

async function shiftTabTo(page: Page, target: Locator) {
    await page.keyboard.press('Shift+Tab')
    await expect(target).toBeFocused()
}

// Tab until the target has focus: for a test whose Tab order another test pins.
async function tabUntil(page: Page, target: Locator) {
    for (let press = 0; press < 12; press++) {
        if (await target.evaluate(el => el === document.activeElement)) return
        await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()
}

function cellOf(page: Page, table: 'account_lines' | 'item_lines', rowId: string) {
    return (column: string) => page.getByTestId(billCellTestId(table, rowId, column))
}

// Every write of a bill or its lines the page sends.
function billWrites(page: Page): Request[] {
    const writes: Request[] = []
    page.on('request', request => {
        const path = new URL(request.url()).pathname
        const isBillWrite =
            request.method() !== 'GET' &&
            /^\/api\/collections\/books_bill(s|_lines)\/records/.test(path)
        if (isBillWrite) writes.push(request)
    })
    return writes
}

// Answers every write to this bill's row with a refusal, as the server would.
async function refuseBillWrites(page: Page, id: string, message: string) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.route(`**/api/collections/books_bills/records/${id}*`, route =>
        route.request().method() === 'PATCH'
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify({ message, data: {} }),
              })
            : route.fallback()
    )
}

test.describe('bill-form: keyboard', () => {
    test('creates and posts a bill from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Bill keyboard create')
        const ref = uniqueRef('KB')
        await openBooks(page)
        await openNewBill(page)
        const today = await localToday(page)
        const due = addDays(today, 30)

        // A bill has no PDF or email view, so no tabs, and no message.
        await expect(page.getByTestId('bill-title')).toHaveText('New bill')
        await expect(page.getByTestId('bill-tab-edit')).toHaveCount(0)
        await expect(page.getByTestId('bill-tab-pdf')).toHaveCount(0)
        await expect(page.getByTestId('form-input-message')).toHaveCount(0)
        await expect(page.getByText(REF_HINT, { exact: true })).toBeVisible()
        await expect(page.getByText(MEMO_HINT, { exact: true })).toBeVisible()
        for (const id of ['bill-cancel', 'bill-save-draft', 'bill-post-new', 'bill-post']) {
            await expect(page.getByTestId(id)).toBeVisible()
        }
        await expect(page.getByTestId('bill-delete-draft')).toHaveCount(0)

        // From here on, no click.
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await page.keyboard.type('Summit')
        await expect(page.getByTestId('form-input-vendor-search')).toBeFocused()
        await expect(page.getByRole('menuitem', { name: SUMMIT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(vendor).toContainText(SUMMIT)

        // A pick moves focus to Terms; the band's links sit between Vendor and Terms.
        const terms = page.getByTestId('form-input-terms')
        await expect(terms).toBeFocused()
        await expect(terms).toContainText('Net 30')
        await shiftTabTo(page, page.getByTestId('bill-edit-vendor'))
        await tabTo(page, terms)

        const date = page.getByTestId('form-input-date')
        await tabTo(page, date)
        await expect(date).toHaveValue(today)
        await tabTo(page, page.getByTestId('form-input-date-open'))
        const dueDate = page.getByTestId('form-input-due_date')
        await tabTo(page, dueDate)
        await expect(dueDate).toHaveValue(due)
        await tabTo(page, page.getByTestId('form-input-due_date-open'))
        await tabTo(page, page.getByTestId('form-input-ref_no'))
        await page.keyboard.type(ref)

        // Account line 1 already holds Summit's default expense account.
        const line1 = await billLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)
        await tabTo(page, account1('account'))
        await expect(account1('account')).toContainText('6200 Software Subscriptions')
        await tabTo(page, account1('description'))
        await page.keyboard.type('Managed services, November')
        await tabTo(page, account1('amount'))
        await page.keyboard.type('125.00')
        await page.keyboard.press('Enter')

        // Enter in the last account line's Amount adds a line and focuses its Account.
        await expect(accountLineRows(page)).toHaveCount(2)
        const line2 = await billLineRowId(page, 'account_lines', 1)
        const account2 = cellOf(page, 'account_lines', line2)
        await page.keyboard.type('Rent')
        await expect(page.getByRole('menuitem', { name: '6100 Rent', exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(account2('account')).toContainText('6100 Rent')
        await expect(account2('description')).toBeFocused()
        await tabTo(page, account2('amount'))
        await page.keyboard.type('-25.00')

        // The core row keys on the focused line: duplicate it, then remove the copy.
        await page.keyboard.press('ControlOrMeta+Alt+d')
        await expect(accountLineRows(page)).toHaveCount(3)
        await page.keyboard.press('ControlOrMeta+Alt+Backspace')
        await expect(accountLineRows(page)).toHaveCount(2)

        // ⌥P adds a product line and focuses its Product picker.
        await page.keyboard.press('Alt+p')
        await expect(itemLineRows(page)).toHaveCount(1)
        const product1 = await billLineRowId(page, 'item_lines', 0)
        const item1 = cellOf(page, 'item_lines', product1)
        await page.keyboard.type('Wireless')
        await expect(page.getByRole('menuitem', { name: ACCESS_POINT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(item1('product')).toContainText(ACCESS_POINT)
        await expect(item1('description')).toHaveValue(ACCESS_POINT_DESCRIPTION)
        await expect(item1('rate')).toHaveValue('121.40')
        await expect(item1('description')).toBeFocused()
        await tabTo(page, item1('quantity'))
        await page.keyboard.type('2')
        await tabTo(page, item1('rate'))
        await page.keyboard.press('Enter')

        // Enter in the last product line's Rate adds a line with its picker open; Escape
        // closes only the picker.
        await expect(itemLineRows(page)).toHaveCount(2)
        const product2 = await billLineRowId(page, 'item_lines', 1)
        const item2 = cellOf(page, 'item_lines', product2)
        const search2 = page.getByTestId(
            `${billCellTestId('item_lines', product2, 'product')}-search`
        )
        await expect(search2).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search2).toHaveCount(0)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(item2('product')).toBeFocused()
        await tabTo(page, item2('description'))
        await tabTo(page, item2('quantity'))
        await tabTo(page, item2('rate'))
        await tabTo(page, page.getByTestId(`form-table-item_lines-menu-${product2}`))
        await tabTo(page, page.getByTestId('form-table-item_lines-add'))
        const memoInput = page.getByTestId('form-input-memo')
        await tabTo(page, memoInput)
        await page.keyboard.type(memo)

        // Post; the empty product line 2 is dropped.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(BILL_URL)
        const readView = page.getByTestId('bill-read-only')
        await expect(readView).toBeVisible()
        await billNumberOf(page)
        await expect(page.getByTestId('bill-badge')).toHaveText('Posted')
        await expect(page.getByTestId('bill-detail-vendor')).toContainText('Vendor')
        await expect(page.getByTestId('bill-detail-vendor')).toContainText(SUMMIT)
        await expect(readView).toContainText(ref)
        await expect(readView).toContainText(formatDay(due))
        await expect(readView).toContainText('Managed services, November')
        await expect(readView).toContainText(money(12_500))
        await expect(readView).toContainText(money(-2_500))
        await expect(readView).toContainText(ACCESS_POINT)
        await expect(readView).toContainText(money(24_280))
        await expect(page.getByTestId('bill-total-account-lines')).toContainText('Account lines')
        await expect(page.getByTestId('bill-total-account-lines')).toContainText(money(10_000))
        await expect(page.getByTestId('bill-total-item-lines')).toContainText(
            'Products and services'
        )
        await expect(page.getByTestId('bill-total-item-lines')).toContainText(money(24_280))
        await expect(page.getByTestId('bill-total')).toContainText(money(34_280))
        await expect(page.getByTestId('bill-balance-due')).toContainText(money(34_280))
        await expect(readView).toContainText(memo)
    })

    test('edits a draft bill from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Bill keyboard edit')
        const ref = uniqueRef('KE')
        await openBooks(page)
        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        const line1 = await billLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)
        await account1('amount').fill('80.00')
        await page.getByTestId('form-input-memo').fill(memo)
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
        const id = billIdFromUrl(page)

        await reopenByBack(page)
        // Back shows the same mounted form; it does not open the draft again, so
        // focus does not move. First-open focus is checked on new, Post & new,
        // correction and copy. Focus the Vendor trigger without a click; from
        // here on, no click.
        const vendorTrigger = page.getByTestId('form-input-vendor')
        await vendorTrigger.focus()
        await expect(vendorTrigger).toBeFocused()
        const refInput = page.getByTestId('form-input-ref_no')
        await tabUntil(page, refInput)
        await page.keyboard.type(ref)
        const amount1 = account1('amount')
        await tabUntil(page, amount1)
        // Tab into Amount selects its text (lesson 25), so typing replaces 80.00.
        await page.keyboard.type('95.50')
        await expect(amount1).toHaveValue('95.50')

        // ⌥↵ adds an account line with its picker open; Escape closes only the picker.
        await page.keyboard.press('Alt+Enter')
        await expect(accountLineRows(page)).toHaveCount(2)
        const line2 = await billLineRowId(page, 'account_lines', 1)
        const search2 = page.getByTestId(
            `${billCellTestId('account_lines', line2, 'account')}-search`
        )
        await expect(search2).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search2).toHaveCount(0)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)

        const saved = page.waitForResponse(
            r =>
                r.request().method() === 'PATCH' &&
                new URL(r.url()).pathname === `/api/collections/books_bills/records/${id}` &&
                r.status() === 200
        )
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await expect(page).toHaveURL(DRAFT_URL_OF(id))

        // The empty trailing account line was dropped at save.
        await reopenByBack(page)
        await expect(refInput).toHaveValue(ref)
        await expect(accountLineRows(page)).toHaveCount(1)
        await expect(amount1).toHaveValue('95.50')
        await expect(page.getByTestId('bill-total')).toContainText(money(9_550))
        await expect(page.getByTestId('bill-balance-due')).toContainText(money(9_550))

        // Post & new: a fresh new form, with no vendor (this form was not opened with one).
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(/\/books\/bills\/new\?fresh=[^&#]+$/)
        await expect(page.getByTestId('bill-title')).toHaveText('New bill')
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await expect(vendor).not.toContainText(SUMMIT)

        await page.keyboard.type('Summit')
        await expect(page.getByRole('menuitem', { name: SUMMIT, exact: true })).toBeVisible()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(vendor).toContainText(SUMMIT)
        await page.keyboard.press('Escape')
        const discard = page.getByTestId('discard-dialog')
        await expect(discard).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).not.toHaveURL(NEW_BILL_URL)
        await expect(page.getByTestId('bill-form')).toHaveCount(0)
    })
})

test.describe('bill-form: form', () => {
    test('saves and posts a bill with account and product lines', async ({ page }) => {
        const memo = uniqueMemo('Bill form lines')
        await openBooks(page)
        await openNewBill(page)
        const today = await localToday(page)

        const mailing = page.getByTestId('bill-mailing-address')
        const terms = page.getByTestId('form-input-terms')
        const dueDate = page.getByTestId('form-input-due_date')
        const line1 = await billLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)

        await pickBillVendor(page, OFFICE_SUPPLY)
        await expect(mailing).toContainText(OFFICE_SUPPLY_LINE1)
        await expect(terms).toContainText('Net 15')
        await expect(dueDate).toHaveValue(addDays(today, 15))
        await expect(account1('account')).toContainText('6210 Design Tools')

        // A second pick refills Mailing address and Terms only (Q8).
        await pickBillVendor(page, PACIFIC_POWER)
        await expect(mailing).not.toContainText(OFFICE_SUPPLY_LINE1)
        await expect(terms).toContainText('Due on receipt')
        await expect(dueDate).toHaveValue(today)
        await expect(account1('account')).toContainText('6210 Design Tools')
        await pickBillVendor(page, OFFICE_SUPPLY)
        await expect(mailing).toContainText(OFFICE_SUPPLY_LINE1)
        await expect(terms).toContainText('Net 15')
        await account1('amount').fill('50.00')

        await page.getByTestId(`form-table-account_lines-menu-${line1}`).click()
        for (const label of [
            'Insert line above',
            'Insert line below',
            'Move up',
            'Move down',
            'Duplicate',
            'Remove',
        ]) {
            // Core Menu.Item puts the key hint into the accessible name after the label.
            await expect(
                page.getByRole('menuitem', { name: new RegExp(`^${label}`) })
            ).toBeVisible()
        }
        await page.keyboard.press('Escape')
        await expect(page.getByRole('menuitem', { name: /^Remove/ })).toHaveCount(0)

        await expect(page.getByTestId('bill-account-lines-heading')).toHaveText('Account details')
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveText(
            'Product and service details'
        )
        await expect(itemLineRows(page)).toHaveCount(0)
        await page.getByTestId('form-table-item_lines-add').click()
        await expect(itemLineRows(page)).toHaveCount(1)
        const product1 = await billLineRowId(page, 'item_lines', 0)
        const item1 = cellOf(page, 'item_lines', product1)

        // The Product picker lists only products I purchase.
        await item1('product').click()
        const search = page.getByTestId(
            `${billCellTestId('item_lines', product1, 'product')}-search`
        )
        await expect(search).toBeFocused()
        await search.fill('Printer paper')
        await expect(page.getByRole('menuitem', { name: /Printer paper/ })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(search).toHaveCount(0)

        // A typed Description stays; the empty Rate fills with the cost.
        await item1('description').fill('Lobby AP')
        await pickBillLineProduct(page, 0, ACCESS_POINT)
        await expect(item1('description')).toHaveValue('Lobby AP')
        await expect(item1('rate')).toHaveValue('121.40')
        await item1('quantity').fill('4')
        await expect(item1('amount')).toContainText(money(48_560))
        await expect(page.getByTestId('bill-total-account-lines')).toContainText(money(5_000))
        await expect(page.getByTestId('bill-total-item-lines')).toContainText(money(48_560))
        await expect(page.getByTestId('bill-total')).toContainText(money(53_560))
        await expect(page.getByTestId('bill-total-balance')).toContainText(money(53_560))
        await expect(page.getByTestId('bill-balance-due')).toContainText(money(53_560))
        await page.getByTestId('form-input-memo').fill(memo)

        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
        await expect(page.getByTestId('bill-badge')).toHaveText('Draft')
        // The wide bar keeps Delete draft in More, as the invoice's bar.
        await page.getByTestId('bill-more').click()
        await expect(page.getByTestId('bill-delete-draft')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bill-delete-draft')).toHaveCount(0)

        await postBill(page)
        const readView = page.getByTestId('bill-read-only')
        await expect(page.getByTestId('bill-badge')).toHaveText('Posted')
        await expect(readView).toContainText('Account details')
        await expect(readView).toContainText('Product and service details')
        await expect(readView).toContainText('Lobby AP')
        // The band names the bill's party and its address (not a customer's).
        const vendorDetail = page.getByTestId('bill-detail-vendor')
        await expect(vendorDetail).toContainText('Vendor')
        await expect(vendorDetail).toContainText(OFFICE_SUPPLY)
        const mailingDetail = page.getByTestId('bill-detail-mailing-address')
        await expect(mailingDetail).toContainText('Mailing address')
        await expect(mailingDetail).toContainText(OFFICE_SUPPLY_LINE1)
        await expect(readView).not.toContainText('Bill to')
        await expect(readView).not.toContainText('Customer')
        await expect(page.getByTestId('bill-total-account-lines')).toContainText(money(5_000))
        await expect(page.getByTestId('bill-total-item-lines')).toContainText(money(48_560))
        await expect(page.getByTestId('bill-total')).toContainText(money(53_560))
        await expect(page.getByTestId('bill-balance-due')).toContainText(money(53_560))
        await expect(page.getByTestId('bill-posted-by')).toContainText('Posted by')
        await expect(readView).toContainText(memo)
    })

    test('shows server refusals under their fields', async ({ page }) => {
        await openBooks(page)

        // The Account cell's own load error, with Retry.
        await page.route('**/api/collections/books_accounts/records*', route =>
            route.fulfill({ status: 400 })
        )
        await openNewBill(page)
        const line1 = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line1, 'account')).click()
        const retry = page.getByRole('button', { name: 'Retry', exact: true })
        await expect(retry).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        await retry.click()
        await expect(page.getByRole('menuitem', { name: '6100 Rent', exact: true })).toBeVisible()
        await page.keyboard.press('Escape')

        // A posted bill for Summit with a unique vendor's bill no.
        const ref = uniqueRef('DUP')
        await pickBillVendor(page, SUMMIT)
        await page.getByTestId('form-input-ref_no').fill(ref)
        await page.getByTestId(billCellTestId('account_lines', line1, 'amount')).fill('40.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Bill refusals first'))
        const number = await postBill(page)

        // A second bill for Summit with the same number: refused under Vendor's bill no.
        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        const refInput = page.getByTestId('form-input-ref_no')
        await refInput.fill(ref)
        const line = await billLineRowId(page, 'account_lines', 0)
        const account = cellOf(page, 'account_lines', line)
        await account('amount').fill('60.00')
        const memo = uniqueMemo('Bill refusals second')
        const memoInput = page.getByTestId('form-input-memo')
        await memoInput.fill(memo)
        await page.getByTestId('bill-save-draft').click()
        await expect(page.getByTestId('form-field-ref_no-error')).toHaveText(
            `${SUMMIT} already has bill no. ${ref} (Bill ${number}).`
        )
        await expect(page).toHaveURL(NEW_BILL_URL)

        await refInput.fill(`${ref}-B`)
        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
        const id = billIdFromUrl(page)
        const draftUrl = DRAFT_URL_OF(id)

        // An account line refusal shows under that line; the draft and its values stay.
        const accountRefusal = 'Account line 1: Rent is inactive. Choose an active account.'
        await refuseBillWrites(page, id, accountRefusal)
        await page.getByTestId('bill-post').click()
        await expect(
            accountLineRows(page).nth(0).getByText(accountRefusal, { exact: true })
        ).toBeVisible()
        await expect(page).toHaveURL(draftUrl)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
        await expect(refInput).toHaveValue(`${ref}-B`)
        await expect(memoInput).toHaveValue(memo)
        await expect(account('amount')).toHaveValue('60.00')

        // A product line refusal shows under that product line.
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('form-table-item_lines-add').click()
        await pickBillLineProduct(page, 0, ACCESS_POINT)
        const productRefusal =
            'Product line 1: Wireless access point is not purchased. Turn on “I purchase this” for it first.'
        await refuseBillWrites(page, id, productRefusal)
        await page.getByTestId('bill-post').click()
        await expect(
            itemLineRows(page).nth(0).getByText(productRefusal, { exact: true })
        ).toBeVisible()
        await expect(page).toHaveURL(draftUrl)

        // An inactive vendor refusal shows under Vendor.
        const vendorRefusal = `${SUMMIT} is inactive. Choose an active vendor.`
        await refuseBillWrites(page, id, vendorRefusal)
        await page.getByTestId('bill-post').click()
        await expect(page.getByTestId('form-field-vendor-error')).toHaveText(vendorRefusal)
        await expect(page).toHaveURL(draftUrl)

        // Anything else (the close date) shows in the error summary.
        await refuseBillWrites(page, id, BILL_REFUSALS.closeDate)
        await page.getByTestId('bill-post').click()
        await expect(page.getByTestId('bill-error-summary')).toContainText(BILL_REFUSALS.closeDate)
        await expect(page).toHaveURL(draftUrl)
        await page.unrouteAll({ behavior: 'wait' })

        // Out of the text fields, so ⌘⌫ is the screen's Delete draft.
        await page.getByTestId('bill-title').click()
        await page.keyboard.press('ControlOrMeta+Backspace')
        const dialog = page.getByTestId('delete-draft-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(DELETE_TITLE)
        await expect(dialog).toContainText(DELETE_BODY)
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).not.toHaveURL(draftUrl)
        await expect(page.getByTestId('bill-form')).toHaveCount(0)

        // Post with no lines: the line-count rule under the tables, and no write.
        await openNewBill(page)
        const writes = billWrites(page)
        await page.getByTestId('bill-post').click()
        await expect(page.getByTestId('bill-line-error')).toHaveText(
            'Add at least one account or product line'
        )
        await expect(page).toHaveURL(NEW_BILL_URL)
        expect(writes).toEqual([])

        // Filling account line 1 clears the line-count rule.
        const emptyLine = await pickLineAccount(page, 0, '6200 Software Subscriptions')
        await page.getByTestId(billCellTestId('account_lines', emptyLine, 'amount')).fill('25.00')
        await expect(page.getByTestId('bill-line-error')).toHaveCount(0)
    })

    test('corrects a posted bill', async ({ page }) => {
        const memo = uniqueMemo('Bill correction')
        await openBooks(page)
        await openNewBill(page)
        const today = await localToday(page)
        await pickBillVendor(page, SUMMIT)
        const line1 = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line1, 'amount')).fill('200.00')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postBill(page)
        const originalId = billIdFromUrl(page)

        // E: a correction that keeps the number.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?replaces=${originalId}$`))
        await expect(page.getByTestId('bill-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('bill-replace-note')).toBeVisible()
        await expect(page.getByTestId('form-input-vendor')).toBeFocused()
        const line = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill('210.00')
        await page.getByTestId('bill-post').click()
        await expect(page).toHaveURL(BILL_URL)
        expect(billIdFromUrl(page)).not.toBe(originalId)
        await expect(page.getByTestId('bill-title')).toHaveText(`Bill ${number}`)
        await expect(page.getByTestId('bill-total')).toContainText(money(21_000))
        const correctionId = billIdFromUrl(page)

        // The original's Void badge and "Replaced by" line are checked in checkpoint 4,
        // through Journal Entries → Open: Edit replaced the original's history entry.

        // C: a copy of the correction, dated today with no vendor's bill no.
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?copy=${correctionId}$`))
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        await expect(vendor).toContainText(SUMMIT)
        const copyLine = await billLineRowId(page, 'account_lines', 0)
        await expect(
            page.getByTestId(billCellTestId('account_lines', copyLine, 'amount'))
        ).toHaveValue('210.00')
        await expect(page.getByTestId('form-input-memo')).toHaveValue(memo)
        await expect(page.getByTestId('form-input-date')).toHaveValue(today)
        await expect(page.getByTestId('form-input-ref_no')).toHaveValue('')
    })
})

test.describe('bill-form: phone', () => {
    test('keeps a draft bill on a phone and deletes it', async ({ page }) => {
        await openBooks(page)
        await page.setViewportSize(PHONE)
        await openNewBill(page)

        // The band stacks Vendor over Mailing address, then Terms / Bill date / Due date /
        // Vendor's bill no. in rows of halves.
        const boxOf = async (testId: string) => {
            const box = await page.getByTestId(testId).boundingBox()
            if (!box) throw new Error(`${testId} has no box`)
            return box
        }
        await expect
            .poll(async () => {
                const vendor = await boxOf('bill-vendor')
                const mailing = await boxOf('bill-mailing-address')
                return mailing.y >= vendor.y + vendor.height - 1
            })
            .toBe(true)
        await expect
            .poll(async () => {
                // The field cells, not the inner inputs, whose offsets differ by picker.
                const terms = await boxOf('form-field-terms')
                const date = await boxOf('form-field-date')
                const due = await boxOf('form-field-due_date')
                const ref = await boxOf('form-field-ref_no')
                return {
                    termsBesideDate: Math.abs(terms.y - date.y) < 2 && date.x > terms.x,
                    dueBesideRef: Math.abs(due.y - ref.y) < 2 && ref.x > due.x,
                    dueBelowTerms: due.y > terms.y + terms.height - 1,
                }
            })
            .toEqual({ termsBesideDate: true, dueBesideRef: true, dueBelowTerms: true })

        // Account line 1 is a card: kind label, then Account, Description and Amount
        // stacked, with the row menu at the top right.
        await expect(page.getByTestId('form-table-account_lines-cards')).toBeVisible()
        const line1 = await billLineRowId(page, 'account_lines', 0)
        const cell = cellOf(page, 'account_lines', line1)
        await expect(page.getByTestId(`form-table-account_lines-kind-${line1}`)).toHaveText(
            'Account line'
        )
        await expect
            .poll(async () => {
                const account = await boxOf(billCellTestId('account_lines', line1, 'account'))
                const description = await boxOf(
                    billCellTestId('account_lines', line1, 'description')
                )
                const amount = await boxOf(billCellTestId('account_lines', line1, 'amount'))
                const menu = await boxOf(`form-table-account_lines-menu-${line1}`)
                return {
                    stacked: description.y > account.y && amount.y > description.y,
                    menuTopRight: menu.y < account.y && menu.x > account.x,
                }
            })
            .toEqual({ stacked: true, menuTopRight: true })
        await expect(cell('amount')).toHaveCSS('text-align', 'right')
        await expect(page.getByTestId('form-table-account_lines-grid')).toHaveCount(0)

        // The product table shows its heading and its add button, with no card.
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveText(
            'Product and service details'
        )
        await expect(page.getByTestId('form-table-item_lines-add')).toBeVisible()
        await expect(itemLineRows(page)).toHaveCount(0)

        // The phone bar: Cancel, Save draft, Post and More.
        for (const id of ['bill-cancel', 'bill-save-draft', 'bill-post', 'bill-more']) {
            await expect(page.getByTestId(id)).toBeVisible()
        }
        await expect(page.getByTestId('bill-post-new')).not.toBeVisible()

        await pickBillVendor(page, SUMMIT)
        await cell('amount').fill('35.00')
        await page.getByTestId('form-input-memo').fill(uniqueMemo('Bill phone draft'))
        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
        const draftUrl = DRAFT_URL_OF(billIdFromUrl(page))

        await page.getByTestId('bill-more').click()
        await expect(page.getByText('Post & new', { exact: true })).toBeVisible()
        const deleteRow = page.getByText('Delete draft', { exact: true })
        await expect(deleteRow).toBeVisible()
        await deleteRow.click()
        const dialog = page.getByTestId('delete-draft-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(DELETE_TITLE)
        await expect(dialog).toContainText(DELETE_BODY)
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).not.toHaveURL(draftUrl)
        await expect(page.getByTestId('bill-form')).toHaveCount(0)
    })
})
