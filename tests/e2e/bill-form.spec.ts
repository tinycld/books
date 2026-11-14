import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { BILL_REFUSALS } from '../../tinycld/books/lib/bill-form-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { createAccount, DESKTOP, openChart, PHONE } from './account-register-helpers'
import {
    accountLineRows,
    BILL_URL,
    billCellTestId,
    billIdFromUrl,
    billLineRowId,
    billNumberOf,
    itemLineRows,
    NEW_BILL_URL,
    openBillBySearch,
    openNewBill,
    openPurchasesSettings,
    pickBillLineProduct,
    pickBillVendor,
    pickLineAccount,
    postBill,
    reopenByBack,
    SETTINGS_ROW_PATH,
    searchToBill,
    setBillLines,
} from './bill-helpers'
import { batchAnswered, refuseBatchWrite } from './document-batch-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import {
    batchOperations,
    makeAccountInactiveElsewhere,
    openEntriesList,
    searchEntries,
} from './journal-entries-helpers'
import { createProduct } from './products-services-helpers'
import { uniqueName } from './record-form-helpers'
import { leaveSettings, visibleTestId } from './sales-receipt-helpers'

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
const PATCH_CABLE = 'Cat6 patch cable, 10 ft'
const ITEM_HEADING = 'Product and service details'
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

const VOID_BODY = 'A reversing entry is posted in the original period. The number is kept.'
// The Journal Entries list's rows, without their row menu buttons.
const ROWS = '[data-testid^="entries-row-"]:not([data-testid^="entries-row-menu-"])'

const DRAFT_URL_OF = (id: string) => new RegExp(`/books/bills/${id}$`)

function entryIdFromUrl(page: Page): string {
    const match = /\/books\/entries\/([^/?#]+)$/.exec(new URL(page.url()).pathname)
    const id = match?.[1]
    if (!id) throw new Error(`Not on a journal entry: ${page.url()}`)
    return id
}

// The entry read view's lines, in one snapshot: account label, debit, credit and name.
function readEntryLines(page: Page) {
    return page.getByTestId('entry-read-only').evaluate(root => {
        const text = (id: string) =>
            (root.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim()
        const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
        return Array.from({ length: count }, (_, i) => ({
            account: text(`entry-line-account-${i}`),
            debit: text(`entry-line-debit-${i}`),
            credit: text(`entry-line-credit-${i}`),
            name: text(`entry-line-party-${i}`),
        }))
    })
}

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

// Every write of a bill or its lines the page sends: a request of its own, or a batch
// (a save) with an operation on them.
function billWrites(page: Page): Request[] {
    const writes: Request[] = []
    page.on('request', request => {
        const path = new URL(request.url()).pathname
        const isBillWrite =
            request.method() !== 'GET' &&
            /^\/api\/collections\/books_bill(s|_lines)\/records/.test(path)
        const isBillBatch = batchOperations(request).some(operation =>
            /\/api\/collections\/books_bill(s|_lines)\/records/.test(operation.url)
        )
        if (isBillWrite || isBillBatch) writes.push(request)
    })
    return writes
}

// Answers every write to this bill's row with a refusal, as the server would: the header
// write of a save's batch, and an update of its own (the post of a new bill).
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
    await refuseBatchWrite(page, 'books_bills', 'PATCH', { message, data: {} })
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

        // The save is one batch: the line writes, then the bill's one header write.
        const saved = batchAnswered(page, 'books_bills', 'PATCH', 200)
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

        // The original is Void and names its correction. Edit replaced the original's
        // history entry, so it is reached through Journal Entries → Open: the search keeps
        // the rows of this memo (the original, its void reversal and the correction), and
        // the original is the Void one typed "Bill".
        await page.getByTestId('bill-cancel').click()
        await expect(page).not.toHaveURL(NEW_BILL_URL)
        await openEntriesList(page)
        await searchEntries(page, memo)
        const original = page
            .locator(ROWS)
            .filter({
                has: page.locator('[data-testid^="entries-cell-type-"]', { hasText: /^Bill$/ }),
            })
            .filter({
                has: page.locator('[data-testid^="entries-status-"]', { hasText: /^Void$/ }),
            })
        await expect(original).toHaveCount(1)
        const entryId = ((await original.getAttribute('data-testid')) ?? '').replace(
            /^entries-row-/,
            ''
        )
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(DRAFT_URL_OF(originalId))
        await expect(page.getByTestId('bill-badge')).toHaveText('Void')
        await expect(page.getByTestId('bill-replaced-by')).toHaveText(
            `Replaced by ${number} (edited)`
        )
    })
})

test.describe('bill-form: across Books', () => {
    test('finds bills through search', async ({ page }) => {
        const postedMemo = uniqueMemo('Bill search posted')
        const draftMemo = uniqueMemo('Bill search draft')
        const ref = uniqueRef('SRCH')
        await openBooks(page)

        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        await page.getByTestId('form-input-ref_no').fill(ref)
        const line1 = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line1, 'amount')).fill('72.00')
        await page.getByTestId('form-input-memo').fill(postedMemo)
        const number = await postBill(page)
        const postedId = billIdFromUrl(page)

        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        const draftLine = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', draftLine, 'amount')).fill('18.00')
        await page.getByTestId('form-input-memo').fill(draftMemo)
        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        const draftForm = page.getByTestId('bill-form')
        await expect(draftForm.getByTestId('bill-title')).toHaveText('Draft bill')
        const draftId = billIdFromUrl(page)

        // Out of the text fields, so `/` opens the search palette.
        await draftForm.getByTestId('bill-title').click()
        await searchToBill(page, ref, `Bill ${number} · ${SUMMIT}`)
        await expect(page).toHaveURL(DRAFT_URL_OF(postedId))
        // The draft's form stays mounted under the pushed read view: scope to the screen.
        const readView = page.getByTestId('bill-read-only')
        await expect(readView).toBeVisible()
        await expect(readView.getByTestId('bill-title')).toHaveText(`Bill ${number}`)

        await searchToBill(page, draftMemo, `Draft bill · ${SUMMIT}`)
        await expect(page).toHaveURL(DRAFT_URL_OF(draftId))
        const reopenedForm = page.getByTestId('bill-form').filter({ visible: true })
        await expect(reopenedForm).toBeVisible()
        await expect(reopenedForm.getByTestId('form-input-memo')).toHaveValue(draftMemo)
    })

    test("links a bill's journal entry back to the bill", async ({ page }) => {
        const memo = uniqueMemo('Bill entry link')
        await openBooks(page)
        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        const line1 = await billLineRowId(page, 'account_lines', 0)
        const account1 = cellOf(page, 'account_lines', line1)
        await expect(account1('account')).toContainText('6200 Software Subscriptions')
        await account1('amount').fill('150.00')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postBill(page)
        const id = billIdFromUrl(page)

        // J: the entry, typed Bill with the bill's number; it debits 6200 and credits
        // Accounts payable, each line naming the vendor.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        const entryId = entryIdFromUrl(page)
        const entry = page.getByTestId('entry-read-only')
        await expect(entry).toBeVisible()
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Bill')
        await expect(page.getByTestId('entry-title')).toHaveText(`Journal entry ${number}`)
        await expect
            .poll(async () => {
                const lines = await readEntryLines(page)
                const expense = lines.find(l => l.account === '6200 Software Subscriptions')
                const payable = lines.find(l => /Accounts payable$/.test(l.account))
                return {
                    count: lines.length,
                    expenseDebit: expense?.debit,
                    payableCredit: payable?.credit,
                    names: [...new Set(lines.map(l => l.name))],
                }
            })
            .toEqual({
                count: 2,
                expenseDebit: money(15_000),
                payableCredit: money(15_000),
                names: [SUMMIT],
            })

        // Journal Entries: Type and No.; the row menu offers Open and Edit, and no Reverse.
        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Bill')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-open')).toBeVisible()
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        const editUrl = new RegExp(`/books/bills/new\\?replaces=${id}$`)
        await page.getByTestId('entries-menu-edit').click()
        await expect(page).toHaveURL(editUrl)
        await expect(page.getByTestId('bill-title')).toHaveText(`Edit ${number}`)
        await page.getByTestId('bill-cancel').click()
        await expect(page).not.toHaveURL(editUrl)

        await openEntriesList(page)
        await searchEntries(page, memo)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(DRAFT_URL_OF(id))
        await expect(page.getByTestId('bill-read-only')).toBeVisible()
    })
})

test.describe('bill-form: phone read view', () => {
    test('voids and copies a posted bill on a phone', async ({ page }) => {
        const memo = uniqueMemo('Bill phone void')
        const ref = uniqueRef('PH')
        await openBooks(page)
        await openNewBill(page)
        const today = await localToday(page)
        await pickBillVendor(page, SUMMIT)
        await page.getByTestId('form-input-ref_no').fill(ref)
        const line1 = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line1, 'amount')).fill('64.00')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postBill(page)
        const id = billIdFromUrl(page)
        await page.setViewportSize(PHONE)

        // The phone bar keeps Edit; More holds Void, Copy and View journal entry.
        await expect(page.getByTestId('bill-read-edit')).toBeVisible()
        await page.getByTestId('bill-read-more').click()
        for (const action of ['read-void', 'read-copy', 'read-entry']) {
            await expect(page.getByTestId(`bill-${action}`)).toBeVisible()
        }
        await page.getByTestId('bill-read-void').click()
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Void bill ${number}?`)
        await expect(dialog).toContainText(VOID_BODY)
        await page.getByTestId('void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId('bill-badge')).toHaveText('Void')
        await expect(page.getByTestId('bill-voided-by')).toContainText('Voided by')

        // A void bill offers Copy and View journal entry only, both in More.
        await expect(page.getByTestId('bill-read-edit')).toHaveCount(0)
        await page.getByTestId('bill-read-more').click()
        await expect(page.getByTestId('bill-read-copy')).toBeVisible()
        await expect(page.getByTestId('bill-read-entry')).toBeVisible()
        await expect(page.getByTestId('bill-read-void')).toHaveCount(0)
        await expect(page.getByTestId('bill-read-edit')).toHaveCount(0)

        await page.getByTestId('bill-read-copy').click()
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?copy=${id}$`))
        await expect(page.getByTestId('bill-title')).toHaveText('New bill')
        await expect(page.getByTestId('form-input-vendor')).toContainText(SUMMIT)
        const copyLine = await billLineRowId(page, 'account_lines', 0)
        const copyCell = cellOf(page, 'account_lines', copyLine)
        await expect(copyCell('account')).toContainText('6200 Software Subscriptions')
        await expect(copyCell('amount')).toHaveValue('64.00')
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

// Two refusals help/bills.md tells users about, through the real server (merge review A,
// item 3). They live in this file, not in sales-documents-conflict.spec.ts, because every
// new bill depends on the shared Bill lines setting, which this file's last tests change:
// another file running beside them could get a bill with no account table.
const BILL_CONFLICT =
    'This bill changed after you opened it. Load the current bill, then review it before you save or post.'

// A second session opens the draft by its memo, sets line 1's amount to 50.00 and
// saves it.
async function saveOtherAmount(other: Page, memo: string) {
    await openBooks(other)
    await openBillBySearch(other, memo)
    await expect(other.getByTestId('form-input-memo')).toHaveValue(memo)
    const otherLine = await billLineRowId(other, 'account_lines', 0)
    await other.getByTestId(billCellTestId('account_lines', otherLine, 'amount')).fill('50.00')
    await other.getByTestId('bill-title').click()
    await expect(other.getByTestId('bill-total')).toContainText(money(5_000))
    const saved = batchAnswered(other, 'books_bills', 'PATCH', 200)
    await other.getByTestId('bill-save-draft').click()
    await saved
}

// Load the current bill: the notice goes and the other session's amount is the
// stored one.
async function loadTheCurrentBill(page: Page) {
    const total = page.getByTestId('bill-total')
    const reload = page.getByTestId('bill-conflict-reload')
    await expect(reload).toHaveText('Load the current bill')
    await reload.click()
    await expect(page.getByTestId('bill-conflict')).toHaveCount(0)
    await expect(total).toContainText(money(5_000))
    await expect(total).not.toContainText(money(7_000))
    const reloadedLine = await billLineRowId(page, 'account_lines', 0)
    await expect(
        page.getByTestId(billCellTestId('account_lines', reloadedLine, 'amount'))
    ).toHaveValue('50.00')
}

test.describe('bill-form: refusals from the server', () => {
    test('a stale bill save is refused and loads the other session’s change', async ({
        page,
        browser,
    }) => {
        const memo = uniqueMemo('Bill conflict')
        await openBooks(page)
        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        const line = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill('40.00')
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')

        // This session changes only line 1's amount: its view is fixed from here.
        const ownLine = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', ownLine, 'amount')).fill('70.00')
        await page.getByTestId('bill-title').click()
        const total = page.getByTestId('bill-total')
        await expect(total).toContainText(money(7_000))

        // A second session sets line 1's amount to 50.00 and saves the draft.
        const context = await browser.newContext()
        try {
            await saveOtherAmount(await context.newPage(), memo)

            // The form's own check sees the moved draft and refuses the save; what was
            // typed stays and nothing is posted.
            await page.getByTestId('bill-save-draft').click()
            await expect(page.getByTestId('bill-conflict')).toContainText(BILL_CONFLICT)
            await expect(total).toContainText(money(7_000))
            await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')

            await loadTheCurrentBill(page)

            // The reviewed post goes through.
            await postBill(page)
            await expect(page.getByTestId('bill-badge')).toHaveText('Posted')
            await expect(page.getByTestId('bill-total')).toContainText(money(5_000))
        } finally {
            await context.close()
        }
    })

    test('with realtime off, the server refuses a stale bill save (409) and the reload reads it again', async ({
        page,
        browser,
    }) => {
        const memo = uniqueMemo('Bill conflict no realtime')
        // No realtime message reaches this session: its store stays as it loaded.
        await page.route('**/api/realtime*', route => route.abort())
        await openBooks(page)
        await openNewBill(page)
        await pickBillVendor(page, SUMMIT)
        const line = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill('40.00')
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')

        const context = await browser.newContext()
        try {
            await saveOtherAmount(await context.newPage(), memo)

            // This session's store did not move, so the form's own check passes and the
            // batch goes out with the revision this form saw. The server refuses it with
            // the bill's 409; what was typed stays.
            const ownLine = await billLineRowId(page, 'account_lines', 0)
            await page.getByTestId(billCellTestId('account_lines', ownLine, 'amount')).fill('70.00')
            await page.getByTestId('bill-title').click()
            const total = page.getByTestId('bill-total')
            await expect(total).toContainText(money(7_000))
            const refused = batchAnswered(page, 'books_bills', 'PATCH', 400)
            await page.getByTestId('bill-save-draft').click()
            const body = await (await refused).json()
            const answers = Object.values(body.data?.requests ?? {}).map(request => {
                const { response } = request as { response?: { status?: number } }
                return response?.status
            })
            expect(answers).toContain(409)
            await expect(page.getByTestId('bill-conflict')).toContainText(BILL_CONFLICT)
            await expect(total).toContainText(money(7_000))
            await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')

            await loadTheCurrentBill(page)

            await postBill(page)
            await expect(page.getByTestId('bill-badge')).toHaveText('Posted')
            await expect(page.getByTestId('bill-total')).toContainText(money(5_000))
        } finally {
            await context.close()
        }
    })

    test('a post is refused when a product line’s expense account became inactive', async ({
        page,
    }) => {
        const account = uniqueName('E2E Bill expense')
        const product = uniqueName('E2E Bill part')
        const memo = uniqueMemo('Bill inactive expense account')
        await openBooks(page)
        await openChart(page)
        await createAccount(page, account, { type: 'Expense', detailType: 'Office and general' })
        await page.getByTestId('books-nav-lists').click()
        await createProduct(page, {
            type: 'non_inventory',
            name: product,
            price: '20.00',
            cost: '12.00',
            expenseAccount: account,
        })

        // A draft bill with one product line (Pacific Power's default account is inactive,
        // so the empty account line 1 is dropped).
        await openNewBill(page)
        await pickBillVendor(page, PACIFIC_POWER)
        await page.getByTestId('form-table-item_lines-add').click()
        const productLine = await pickBillLineProduct(page, 0, product)
        await expect(cellOf(page, 'item_lines', productLine)('rate')).toHaveValue('12.00')
        await page.getByTestId('form-input-memo').fill(memo)
        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')

        // Another tab makes the account inactive after the product and the draft named it:
        // the picker offers no product whose expense account is inactive, so this is the
        // way a person reaches the rule.
        await makeAccountInactiveElsewhere(page, account)

        await page.getByTestId('bill-post').click()
        const refusal = `Product line 1: the expense account of ${product} is inactive. Choose an active one on the product or service.`
        await expect(itemLineRows(page).nth(0).getByText(refusal, { exact: true })).toBeVisible()
        await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
        await expect(page.getByTestId('bill-read-only')).toHaveCount(0)
    })
})

// Settings → Purchases → Bill lines (spec §3.11), checkpoint 5. The setting is the shared
// books_settings row: only this file changes it, its tests run in order on one worker,
// and each test stores "Accounts and products" again before it ends. The restore runs in
// `afterEach`, not a `finally`: a step that waits out the test timeout closes the page
// before a `finally` runs, so the restore then fails and hides the first error; an
// `afterEach` gets its own time on the still open page.
const SAVE_REFUSAL = 'Books could not save this setting.'

// Every line row of a table anywhere on the page, so a table that is not drawn counts 0.
function anyLineRows(page: Page, table: 'account_lines' | 'item_lines') {
    return page.locator(`[data-testid^="form-table-${table}-row-"]`)
}

async function restoreBillLines(page: Page) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.setViewportSize(DESKTOP)
    await setBillLines(page, 'Accounts and products')
}

test.describe('bill-form: bill lines setting', () => {
    test.afterEach(async ({ page }) => {
        await restoreBillLines(page)
    })

    test("Accounts only hides the product table but keeps a bill's product lines", async ({
        page,
    }) => {
        const memo = uniqueMemo('Bill lines accounts only')
        await openBooks(page)
        // Under the default: a posted bill with one product line (Pacific Power's
        // default account is inactive, so account line 1 stays empty and is dropped).
        await openNewBill(page)
        await pickBillVendor(page, PACIFIC_POWER)
        await page.getByTestId('form-table-item_lines-add').click()
        const productLine = await pickBillLineProduct(page, 0, PATCH_CABLE)
        const item = cellOf(page, 'item_lines', productLine)
        await expect(item('rate')).toHaveValue('3.10')
        await item('quantity').fill('5')
        await page.getByTestId('form-input-memo').fill(memo)
        const number = await postBill(page)
        const originalId = billIdFromUrl(page)
        await expect(page.getByTestId('bill-read-only')).toContainText(PATCH_CABLE)

        // A refused save shows the server's text and keeps the chosen value.
        await openPurchasesSettings(page)
        const select = visibleTestId(page, 'books-settings-bill-lines')
        const save = visibleTestId(page, 'books-settings-bill-lines-save')
        await expect(select).toContainText('Accounts and products')
        await page.route(`**${SETTINGS_ROW_PATH}*`, route =>
            route.request().method() === 'PATCH'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ message: SAVE_REFUSAL, data: {} }),
                  })
                : route.fallback()
        )
        await select.click()
        const accountsOnly = page.getByRole('menuitem', { name: 'Accounts only', exact: true })
        await accountsOnly.click()
        await expect(accountsOnly).toHaveCount(0)
        await save.click()
        await expect(visibleTestId(page, 'books-settings-bill-lines-error')).toContainText(
            SAVE_REFUSAL
        )
        await expect(select).toContainText('Accounts only')

        // Saved once the server answers.
        await page.unrouteAll({ behavior: 'wait' })
        const stored = page.waitForResponse(
            response =>
                response.request().method() === 'PATCH' &&
                new URL(response.url()).pathname === SETTINGS_ROW_PATH
        )
        await save.click()
        expect((await stored).status()).toBe(200)
        await expect(save).toBeDisabled()
        await expect(visibleTestId(page, 'books-settings-bill-lines-error')).toHaveCount(0)

        // The section list (the phone rows; the wide rail draws no summaries).
        await page.setViewportSize(PHONE)
        await visibleTestId(page, 'books-settings-back').click()
        await expect(visibleTestId(page, 'books-settings-section-purchases')).toContainText(
            'Bill lines: Accounts only'
        )
        await page.setViewportSize(DESKTOP)
        await leaveSettings(page)

        // New → Bill: Account details with one empty account line, no product table.
        await openNewBill(page)
        await expect(page.getByTestId('bill-account-lines-heading')).toHaveText('Account details')
        await expect(accountLineRows(page)).toHaveCount(1)
        const line1 = await billLineRowId(page, 'account_lines', 0)
        await expect(cellOf(page, 'account_lines', line1)('amount')).toHaveValue('')
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveCount(0)
        await expect(
            page.getByTestId('bill-form').getByText(ITEM_HEADING, { exact: true })
        ).toHaveCount(0)
        await expect(page.getByTestId('form-table-item_lines-add')).toHaveCount(0)

        // ⌥P adds nothing: the product table registers no keys while it is not shown.
        const rowMenu = page.getByTestId(`form-table-account_lines-menu-${line1}`)
        await rowMenu.focus()
        await expect(rowMenu).toBeFocused()
        await page.keyboard.press('Alt+p')
        await expect(anyLineRows(page, 'item_lines')).toHaveCount(0)
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveCount(0)
        await expect(accountLineRows(page)).toHaveCount(1)

        // Tab from the row menu: Add account line, then Memo (no product table stops).
        const addAccount = page.getByTestId('form-table-account_lines-add')
        await tabTo(page, addAccount)
        await expect(addAccount).toContainText('Add account line')
        await tabTo(page, page.getByTestId('form-input-memo'))
        await page.getByTestId('bill-cancel').click()
        await expect(page).not.toHaveURL(NEW_BILL_URL)

        // The read view shows every table that has lines, whatever the setting.
        await openBillBySearch(page, memo)
        const readView = page.getByTestId('bill-read-only')
        await expect(readView).toBeVisible()
        await expect(readView).toContainText(ITEM_HEADING)
        await expect(readView).toContainText(PATCH_CABLE)

        // E: the correction still shows the product table with its line.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?replaces=${originalId}$`))
        await expect(page.getByTestId('bill-title')).toHaveText(`Edit ${number}`)
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveText(ITEM_HEADING)
        await expect(itemLineRows(page)).toHaveCount(1)
        const correctionLine = await billLineRowId(page, 'item_lines', 0)
        await expect(cellOf(page, 'item_lines', correctionLine)('product')).toContainText(
            PATCH_CABLE
        )

        // Once shown in a form session a table stays shown, even after its last line is
        // removed and the first save replaces the route with the new draft's id.
        await page.getByTestId(`form-table-item_lines-menu-${correctionLine}`).click()
        await page.getByRole('menuitem', { name: /^Remove/ }).click()
        await expect(itemLineRows(page)).toHaveCount(0)
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveText(ITEM_HEADING)
        await page.getByTestId('bill-save-draft').click()
        await expect(page).toHaveURL(BILL_URL)
        await expect(page.getByTestId('bill-form')).toBeVisible()
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveText(ITEM_HEADING)
        await expect(page.getByTestId('form-table-item_lines-add')).toContainText(
            'Add product line'
        )
    })

    test('Products only starts with a product line', async ({ page }) => {
        const memo = uniqueMemo('Bill lines products only')
        await openBooks(page)
        await setBillLines(page, 'Products only')
        await leaveSettings(page)

        // New → Bill: one empty product line and no account table.
        await openNewBill(page)
        await expect(page.getByTestId('bill-item-lines-heading')).toHaveText(ITEM_HEADING)
        await expect(itemLineRows(page)).toHaveCount(1)
        await expect(page.getByTestId('bill-account-lines-heading')).toHaveCount(0)
        await expect(page.getByTestId('form-table-account_lines-add')).toHaveCount(0)
        await expect(anyLineRows(page, 'account_lines')).toHaveCount(0)

        // Summit's default expense account has no line to fill.
        await pickBillVendor(page, SUMMIT)
        await expect(anyLineRows(page, 'account_lines')).toHaveCount(0)
        await expect(page.getByTestId('bill-account-lines')).toHaveCount(0)

        // Enter in Rate adds product line 2 and focuses its Product picker.
        const productLine = await pickBillLineProduct(page, 0, ACCESS_POINT)
        const item = cellOf(page, 'item_lines', productLine)
        await item('quantity').fill('2')
        await item('rate').click()
        await expect(item('rate')).toHaveValue('121.40')
        await page.keyboard.press('Enter')
        await expect(itemLineRows(page)).toHaveCount(2)
        const product2 = await billLineRowId(page, 'item_lines', 1)
        const search2 = page.getByTestId(
            `${billCellTestId('item_lines', product2, 'product')}-search`
        )
        await expect(search2).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(search2).toHaveCount(0)

        // Post; the empty product line 2 is dropped.
        await page.getByTestId('form-input-memo').fill(memo)
        await postBill(page)
        const readView = page.getByTestId('bill-read-only')
        await expect(readView).toContainText(ACCESS_POINT)
        await expect(readView).not.toContainText('Account details')
        await expect(page.getByTestId('bill-total')).toContainText(money(24_280))
        await expect(page.getByTestId('bill-balance-due')).toContainText(money(24_280))
    })
})
