import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { searchToBill } from './bill-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { openEntriesList, searchEntries } from './journal-entries-helpers'
import {
    CHECKING,
    filterToVendor,
    localDay,
    openPayBills,
    PAY_BILLS_URL,
    payBillsRow,
    payBillsRowAmount,
    pickSelect,
    shown,
    vendorWithBills,
} from './pay-bills-helpers'
import {
    applyAmountCell,
    applyCreditToBill,
    applyDialog,
    creditCellTestId,
    creditLineRowId,
    openVendorCreditBySearch,
    postVendorCredit,
    VENDOR_CREDIT_URL,
    vendorCreditIdFromUrl,
} from './vendor-credit-helpers'

// Where an applied vendor credit shows outside its own read view (vendor credit spec
// §3.10–§3.13), checkpoint 5: the bill's read view (Credits applied, the credit rows of
// the Payments block with Remove, the void refusal), Pay Bills (the notice of unapplied
// credits, the open balance after credits), the corrections and void of an applied credit,
// its journal entry in the Journal Entries list, and its help topic. Every test makes its
// own vendor with posted bills (`vendorWithBills`) and its own posted credit with a unique
// memo, so no other worker's bill or credit is in its rows and no seeded document moves.
//
// No phone test: the bill's Payments block and the Pay Bills notice are the same
// components at both widths. Not driven here: the server rules (vendor_credits_test.go,
// vendor_credit_applications_test.go, bills_test.go), the cash basis (Go), the help texts
// (tests/help-*.test.ts).

const RENT = '6100 Rent'
const MINUS = '−'
const LOAD_FAILED = 'Books could not load the open bills.'
const BILL_VOID_REFUSED = 'Vendor credits are applied to this bill. Remove them first.'
const CREDIT_VOID_REFUSED = 'This credit is applied to bills. Remove it from those bills first.'
const BELOW_APPLIED = '$30.00 of this credit is applied to bills. Its total cannot be below that.'
const CREDIT_ROWS = '[data-testid^="bill-credit-"]:not([data-testid^="bill-credit-remove-"])'
const CREDIT_REMOVES = '[data-testid^="bill-credit-remove-"]'

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

function billUrlOf(id: string) {
    return new RegExp(`/books/bills/${id}$`)
}

function creditUrlOf(id: string) {
    return new RegExp(`/books/vendor-credits/${id}$`)
}

function removeText(billNumber: string, amount: string) {
    return `Remove this credit from Bill ${billNumber}? The bill's balance goes up by ${amount} and the credit is unapplied again.`
}

function entryIdFromUrl(page: Page): string {
    const id = /\/books\/entries\/([^/?#]+)$/.exec(new URL(page.url()).pathname)?.[1]
    if (!id) throw new Error(`Not on a journal entry: ${page.url()}`)
    return id
}

// The names on the entry read view's lines, in one snapshot.
function entryLineNames(page: Page) {
    return page.getByTestId('entry-read-only').evaluate(root => {
        const count = root.querySelectorAll('[data-testid^="entry-line-account-"]').length
        return Array.from({ length: count }, (_, i) =>
            (root.querySelector(`[data-testid="entry-line-party-${i}"]`)?.textContent ?? '').trim()
        )
    })
}

// True while each box lies below the one before it on the screen.
async function isTopToBottom(targets: Locator[]): Promise<boolean> {
    let last = Number.NEGATIVE_INFINITY
    for (const target of targets) {
        const box = await target.boundingBox()
        if (!box) return false
        if (box.y <= last) return false
        last = box.y
    }
    return true
}

test.describe('vendor-credit-form: bill read view', () => {
    test('a bill shows the credit applied to it, refuses Void, and Remove takes it off', async ({
        page,
    }) => {
        const memo = uniqueMemo('Vendor credit on a bill')
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '100.00', due: await localDay(page, 10) }],
        })
        const [bill] = bills
        const credit = await postVendorCredit(page, {
            vendor: vendor.name,
            account: RENT,
            amount: '30.00',
            memo,
        })
        const today = formatDay(await localToday(page))
        await applyCreditToBill(page, { memo, billId: bill.id, amount: '30.00' })
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Applied')

        // A refused read of the bill's credit applications, on a fresh page (its store holds
        // none, and realtime is cut before login, lesson 22): the totals still add up from
        // the stored bill (Credits applied above Balance due), and the Payments block shows
        // the notice with Retry, never a block with a silently missing credit. Retry after
        // the route is gone shows the credit row.
        const failed = await page.context().newPage()
        await failed.route('**/api/realtime*', route => route.abort())
        await failed.route('**/api/collections/books_vendor_credit_applications/records*', route =>
            route.request().method() === 'GET' ? route.fulfill({ status: 400 }) : route.fallback()
        )
        await openBooks(failed)
        await openEntriesList(failed)
        await searchToBill(failed, vendor.name, `Bill ${bill.number} · ${vendor.name}`)
        await expect(failed).toHaveURL(billUrlOf(bill.id))
        await expect(shown(failed, 'bill-read-only')).toBeVisible()
        await expect(shown(failed, 'bill-payments-credits-banner')).toContainText(
            'Books could not load the credits applied to this bill.'
        )
        await expect(shown(failed, 'bill-total')).toContainText('$100.00')
        await expect(shown(failed, 'bill-total-credits')).toContainText('Credits applied')
        await expect(shown(failed, 'bill-total-credits')).toContainText(`${MINUS}$30.00`)
        await expect(shown(failed, 'bill-total-balance')).toContainText('$70.00')
        await expect(shown(failed, 'bill-balance-due')).toHaveText('$70.00')
        const failedBlock = shown(failed, 'bill-payments')
        await expect(failedBlock.locator(CREDIT_ROWS)).toHaveCount(0)
        const creditsRetry = shown(failed, 'bill-payments-credits-retry')
        await expect(creditsRetry).toBeVisible()
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.route('**/api/realtime*', route => route.abort())
        await creditsRetry.click()
        await expect(shown(failed, 'bill-payments-credits-banner')).toHaveCount(0)
        await expect(failedBlock.locator(CREDIT_ROWS)).toHaveCount(1)
        await expect(failedBlock).toContainText(`Vendor credit ${credit.number} · `)
        await expect(shown(failed, 'bill-total-credits')).toContainText(`${MINUS}$30.00`)
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.close()

        // The bill through search, from the Journal Entries list (so the credit's screen is
        // not below it): Partly paid, Credits applied −$30.00 above Balance due $70.00.
        await openEntriesList(page)
        await searchToBill(page, vendor.name, `Bill ${bill.number} · ${vendor.name}`)
        await expect(page).toHaveURL(billUrlOf(bill.id))
        await expect(shown(page, 'bill-read-only')).toBeVisible()
        await expect(shown(page, 'bill-badge')).toHaveText('Partly paid')
        const credits = shown(page, 'bill-total-credits')
        await expect(credits).toContainText('Credits applied')
        await expect(credits).toContainText(`${MINUS}$30.00`)
        await expect(shown(page, 'bill-total-balance')).toContainText('$70.00')
        await expect(shown(page, 'bill-balance-due')).toHaveText('$70.00')
        await expect(shown(page, 'bill-total-payments')).toHaveCount(0)
        await expect
            .poll(() =>
                isTopToBottom([
                    shown(page, 'bill-total'),
                    credits,
                    shown(page, 'bill-total-balance'),
                ])
            )
            .toBe(true)

        // The Payments block lists the credit; its link opens the credit, and Back returns.
        const block = shown(page, 'bill-payments')
        await expect(block).toContainText(`Vendor credit ${credit.number} · ${today} · $30.00`)
        await expect(block.locator(CREDIT_ROWS)).toHaveCount(1)
        await block.getByText(new RegExp(`^Vendor credit ${credit.number} · `)).click()
        await expect(page).toHaveURL(creditUrlOf(credit.id))
        await expect(shown(page, 'vendor-credit-title')).toHaveText(
            `Vendor credit ${credit.number}`
        )
        await shown(page, 'entry-back').click()
        await expect(page).toHaveURL(billUrlOf(bill.id))
        await expect(shown(page, 'bill-badge')).toHaveText('Partly paid')

        // V: the void is refused in the Void dialog; the bill stays Partly paid.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog.getByTestId('entry-error-summary')).toContainText(BILL_VOID_REFUSED)
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'bill-badge')).toHaveText('Partly paid')

        // Remove on the credit row asks first; confirming takes the credit off the bill.
        await block.locator(CREDIT_REMOVES).click()
        const confirmText = page.getByText(removeText(bill.number, '$30.00'), { exact: true })
        await expect(confirmText).toBeVisible()
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(confirmText).toHaveCount(0)
        await expect(shown(page, 'bill-payments')).toHaveCount(0)
        await expect(shown(page, 'bill-total-credits')).toHaveCount(0)
        await expect(shown(page, 'bill-balance-due')).toHaveText('$100.00')
        await expect(shown(page, 'bill-total-balance')).toContainText('$100.00')
        await expect(shown(page, 'bill-badge')).toHaveText('Posted')

        // The credit, through search, is unapplied again.
        await openVendorCreditBySearch(page, memo)
        await expect(page).toHaveURL(creditUrlOf(credit.id))
        await expect(shown(page, 'vendor-credit-total-unapplied')).toContainText('$30.00')
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Posted')
    })
})

test.describe('vendor-credit-form: pay bills', () => {
    test.afterEach(async ({ page }) => {
        await page.unrouteAll({ behavior: 'wait' })
    })

    test('Pay Bills lists the unapplied credits of the shown vendors and nothing else changes', async ({
        page,
    }) => {
        const memo = uniqueMemo('Vendor credit on Pay Bills')
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [
                { amount: '30.00', due: await localDay(page, 5) },
                { amount: '100.00', due: await localDay(page, 20) },
            ],
        })
        const [small, large] = bills
        const credit = await postVendorCredit(page, {
            vendor: vendor.name,
            account: RENT,
            amount: '50.00',
            memo,
        })

        // Pay Bills filtered to the vendor: the notice above the open bills names the credit
        // only, as a link of at least 44 px.
        await openPayBills(page)
        await filterToVendor(page, vendor)
        await expect(payBillsRow(page, small.id)).toBeVisible()
        const notice = page.getByTestId('pay-bills-credits-notice')
        await expect(notice).toBeVisible()
        const creditLink = page.getByTestId(`pay-bills-credit-${credit.id}`)
        await expect(creditLink).toContainText(
            `Vendor credit ${credit.number} · ${vendor.name} · $50.00 unapplied`
        )
        await expect(notice.locator('[data-testid^="pay-bills-credit-"]')).toHaveCount(1)
        await expect
            .poll(async () => (await creditLink.boundingBox())?.height ?? 0)
            .toBeGreaterThanOrEqual(44)
        await expect
            .poll(() => isTopToBottom([notice, page.getByTestId('pay-bills-grid')]))
            .toBe(true)

        // The link opens the credit; A and ⌘↵ apply it in full, oldest due first.
        await creditLink.click()
        await expect(page).toHaveURL(creditUrlOf(credit.id))
        await expect(shown(page, 'vendor-credit-read-only')).toBeVisible()
        await page.keyboard.press('a')
        await expect(applyDialog(page)).toBeVisible()
        const smallCell = applyAmountCell(page, small.id)
        await expect(smallCell).toBeFocused()
        await expect(smallCell).toHaveValue('30.00')
        await expect(applyAmountCell(page, large.id)).toHaveValue('20.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(applyDialog(page)).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Applied')

        // Back on Pay Bills, still filtered to the vendor: the $30.00 bill is paid and gone,
        // the other is open for $80.00, the notice is gone, and no column is "Credit".
        await page.goBack()
        await expect(page).toHaveURL(PAY_BILLS_URL)
        await expect(page.getByTestId('pay-bills-vendor-filter')).toContainText(vendor.name)
        await expect(payBillsRow(page, small.id)).toHaveCount(0)
        await expect(payBillsRow(page, large.id)).toContainText('$80.00')
        await expect(notice).toHaveCount(0)
        await expect(page.getByTestId('pay-bills-grid')).not.toContainText(/\bCredit\b/)

        // A payment is still at most the open balance after the credit.
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await payBillsRowAmount(page, large.id).fill('80.01')
        await page.getByTestId('pay-bills-pay').click()
        await expect(page.getByTestId(`pay-bills-row-error-${large.id}`)).toHaveText(
            'More than the open balance of $80.00'
        )
        await expect(page).toHaveURL(PAY_BILLS_URL)

        // A refused read of the vendor credits on a fresh page (its store holds none, and
        // realtime is cut before login, lesson 22): the screen's load error with Retry,
        // never a form with a silently missing notice. Retry loads the bills.
        const failed = await page.context().newPage()
        await failed.route('**/api/realtime*', route => route.abort())
        await failed.route('**/api/collections/books_vendor_credits/records*', route =>
            route.request().method() === 'GET'
                ? route.fulfill({
                      status: 400,
                      contentType: 'application/json',
                      body: JSON.stringify({ status: 400, message: 'Refused.', data: {} }),
                  })
                : route.fallback()
        )
        await openBooks(failed)
        await openPayBills(failed)
        const message = failed.getByTestId('pay-bills-message')
        await expect(message).toContainText(LOAD_FAILED)
        const retry = failed.getByTestId('pay-bills-retry')
        await expect(retry).toBeVisible()
        await expect(failed.getByTestId('pay-bills-form')).toHaveCount(0)
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.route('**/api/realtime*', route => route.abort())
        await retry.click()
        await expect(message).toHaveCount(0)
        await filterToVendor(failed, vendor)
        await expect(payBillsRow(failed, large.id)).toBeVisible()
        await failed.unrouteAll({ behavior: 'wait' })
        await failed.close()
    })
})

test.describe('vendor-credit-form: corrections and the ledger', () => {
    test('an applied credit is corrected within its applications, refuses Void, and opens from its entry', async ({
        page,
    }) => {
        const memo = uniqueMemo('Vendor credit correction applied')
        await openBooks(page)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '100.00', due: await localDay(page, 10) }],
        })
        const [bill] = bills
        const credit = await postVendorCredit(page, {
            vendor: vendor.name,
            account: RENT,
            amount: '50.00',
            memo,
        })
        await applyCreditToBill(page, { memo, billId: bill.id, amount: '30.00' })
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Partly applied')

        // E: a correction below the $30.00 applied is refused, and the form keeps its values.
        await page.keyboard.press('e')
        const editUrl = new RegExp(`/books/vendor-credits/new\\?replaces=${credit.id}$`)
        await expect(page).toHaveURL(editUrl)
        await expect(shown(page, 'vendor-credit-title')).toHaveText(`Edit ${credit.number}`)
        const line = await creditLineRowId(page, 'account_lines', 0)
        const amount = page.getByTestId(creditCellTestId('account_lines', line, 'amount'))
        await amount.fill('20.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(shown(page, 'vendor-credit-error-summary')).toContainText(BELOW_APPLIED)
        await expect(page).toHaveURL(editUrl)
        await expect(amount).toHaveValue('20.00')
        await expect(page.getByTestId('form-input-memo')).toHaveValue(memo)
        await expect(page.getByTestId('form-input-vendor')).toContainText(vendor.name)

        // $40.00 posts: the number is kept, Partly applied, Unapplied credit $10.00, and the
        // application moved to the correction with the bill named.
        await amount.fill('40.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(VENDOR_CREDIT_URL)
        const correctionId = vendorCreditIdFromUrl(page)
        expect(correctionId).not.toBe(credit.id)
        await expect(shown(page, 'vendor-credit-read-only')).toBeVisible()
        await expect(shown(page, 'vendor-credit-title')).toHaveText(
            `Vendor credit ${credit.number}`
        )
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Partly applied')
        await expect(shown(page, 'vendor-credit-total-unapplied')).toContainText('$10.00')
        await expect(shown(page, 'vendor-credit-applications')).toContainText(
            `Bill ${bill.number} · `
        )

        // V: the void of an applied credit is refused.
        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await page.getByTestId('void-confirm').click()
        await expect(dialog.getByTestId('entry-error-summary')).toContainText(CREDIT_VOID_REFUSED)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'vendor-credit-badge')).toHaveText('Partly applied')

        // J: the entry names the vendor on every line.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        await expect(page.getByTestId('entry-read-only')).toBeVisible()
        const entryId = entryIdFromUrl(page)
        await expect
            .poll(async () => [...new Set(await entryLineNames(page))])
            .toEqual([vendor.name])

        // The Journal Entries list, searched by the memo: Type Vendor credit and the number;
        // Open goes to the credit.
        await openEntriesList(page)
        await searchEntries(page, memo)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Vendor credit')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(credit.number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(creditUrlOf(correctionId))
        const readView = shown(page, 'vendor-credit-read-only')
        await expect(readView).toBeVisible()

        // The help icon opens the Vendor credits topic: its title, and the full topic's text
        // on the duplicate vendor's credit no. (no text of the read view has it).
        await readView.getByLabel('Open help').click()
        await expect(
            page.getByText('Vendor credits', { exact: true }).filter({ visible: true }).first()
        ).toBeVisible()
        await expect(
            page
                .getByText(/already has credit no\./)
                .filter({ visible: true })
                .first()
        ).toBeVisible()
    })
})
