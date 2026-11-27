import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { VENDOR_IDS, VENDORS } from '../../tinycld/books/lib/vendor-form-fixture'
import { DESKTOP } from './account-register-helpers'
import { batchAnswered } from './document-batch-helpers'
import { businessName } from './email-share-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { openEntriesList } from './journal-entries-helpers'
import { shiftTabTo, tabTo } from './keyboard-helpers'
import { newActionItem, openNewMenu } from './new-menu-helpers'
import {
    makePurchaseOrder,
    NEW_PURCHASE_ORDER_URL,
    openPurchaseOrderBySearch,
    PURCHASE_ORDER_EDIT_URL,
    PURCHASE_ORDER_URL,
    purchaseOrderCell,
    purchaseOrderIdFromUrl,
    purchaseOrderLineRowId,
    purchaseOrderLineRows,
    purchaseOrderNumberOf,
    visibleOrderPart,
} from './purchase-order-helpers'
import { expectNotRecordUrl, expectRecordUrl } from './record-key-helpers'

// The purchase order form from the keyboard only (purchase order spec §3.3–§3.6),
// checkpoint 3. After the form opens no click: focus starts in Vendor, Tab moves between
// the fields in the spec's order (lessons 16 and 28), a picker opens by typing, and
// ⌘S / ⌘↵ / ⌘⇧↵ / Esc / ⌥↵ / ⌥P / ⌥1 / ⌥2 / ⌘P and the read keys E and C run the actions.
// Every order is made by the spec with a unique memo and reopened through search; no
// seeded order is changed, and an order's number is read from its title.

// Two vendors with an email, an address and a default expense account
// (lib/vendor-form-fixture.ts).
function vendorOf(id: string) {
    const row = VENDORS.find(vendor => vendor.id === id)
    if (!row?.address?.line1 || !row.email) throw new Error(`no address or email for ${id}`)
    return { name: row.display_name, email: row.email, line1: row.address.line1 }
}

function productName(id: string) {
    const row = PRODUCTS.find(product => product.id === id)
    if (!row) throw new Error(`no product ${id} in the fixture`)
    return row.name
}

const OFFICE_SUPPLY = vendorOf(VENDOR_IDS.officeSupply)
const METRO = vendorOf('vendmetroprop01')
// Office Supply World's default expense account (expense_account_number 6210).
const OFFICE_SUPPLY_ACCOUNT = '6210 Design Tools'
const ACCESS_POINT = productName(PRODUCT_IDS.accessPoint)
const ACCESS_POINT_DESCRIPTION = 'Wi-Fi 6E access point, ceiling mount, PoE powered.'
const PATCH_CABLE = productName(PRODUCT_IDS.patchCable)

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(cents / 100)
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// Types into the focused picker trigger, which opens its search, and picks the one
// option named `label` with the arrow key and Enter.
async function pickByTyping(page: Page, typed: string, label: string) {
    await page.keyboard.type(typed)
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
}

// Tab until the target has focus: for a stretch whose order the create test pins.
async function tabUntil(page: Page, target: Locator, max = 30) {
    for (let press = 0; press < max; press++) {
        if (await target.evaluate(el => el === document.activeElement)) return
        await page.keyboard.press('Tab')
    }
    await expect(target).toBeFocused()
}

// A line of the read view, found by the text it holds.
function readLine(page: Page, text: string) {
    return visibleOrderPart(page, 'purchase-order-read-only')
        .locator('[data-testid^="purchase-order-read-line-"]')
        .filter({ hasText: text })
}

test.describe('purchase-orders: keyboard', () => {
    test('a purchase order is created from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Purchase order keyboard create')
        const message = 'Deliver to the loading dock, weekdays before 3 pm.'
        await openBooks(page)
        const business = await businessName(page)
        const today = await localToday(page)

        // The only mouse steps: the New menu and its Purchase order item.
        await openEntriesList(page)
        await openNewMenu(page)
        await newActionItem(page, 'purchase_order').click()
        await expect(page).toHaveURL(NEW_PURCHASE_ORDER_URL)
        await expect(visibleOrderPart(page, 'purchase-order-title')).toHaveText(
            'New purchase order'
        )
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()
        const shipTo = page.getByTestId('form-input-ship_to')
        await expect(shipTo).toHaveValue(new RegExp(`^${escapeRegExp(business)}\\n`))

        // A pick fills Mailing address, Email and account line 1's account, and moves
        // focus to Email.
        await pickByTyping(page, 'Office', OFFICE_SUPPLY.name)
        await expect(vendor).toContainText(OFFICE_SUPPLY.name)
        const email = page.getByTestId('form-input-email')
        await expect(email).toBeFocused()
        await expect(email).toHaveValue(OFFICE_SUPPLY.email)
        const address = page.getByTestId('purchase-order-mailing-address')
        await expect(address).toContainText(OFFICE_SUPPLY.line1)
        const line1 = await purchaseOrderLineRowId(page, 'account_lines', 0)
        const account1 = purchaseOrderCell(page, 'account_lines', line1)
        await expect(account1('account')).toContainText(OFFICE_SUPPLY_ACCOUNT)

        // Back through the band's links to Vendor; a second vendor refills Mailing
        // address and Email only.
        await shiftTabTo(page, page.getByTestId('purchase-order-edit-vendor'))
        await shiftTabTo(page, page.getByTestId('purchase-order-edit-address'))
        await shiftTabTo(page, vendor)
        await pickByTyping(page, 'Metro', METRO.name)
        await expect(vendor).toContainText(METRO.name)
        await expect(email).toBeFocused()
        await expect(email).toHaveValue(METRO.email)
        await expect(address).toContainText(METRO.line1)
        await expect(address).not.toContainText(OFFICE_SUPPLY.line1)
        await expect(account1('account')).toContainText(OFFICE_SUPPLY_ACCOUNT)

        // The spec's Tab order: Email → Order date → Ship to → account line 1 → Add
        // account line → Add product line → Message → Memo.
        const date = page.getByTestId('form-input-date')
        await tabTo(page, date)
        await expect(date).toHaveValue(today)
        await tabTo(page, page.getByTestId('form-input-date-open'))
        await tabTo(page, shipTo)
        await tabTo(page, account1('account'))
        await tabTo(page, account1('description'))
        await page.keyboard.type('Freight to the annex')
        await tabTo(page, account1('amount'))
        await page.keyboard.type('45.00')
        await tabTo(page, page.getByTestId(`form-table-account_lines-menu-${line1}`))
        await tabTo(page, page.getByTestId('form-table-account_lines-add'))
        await tabTo(page, page.getByTestId('form-table-item_lines-add'))

        // ⌥P adds product line 1 with its picker; a pick fills the purchase description.
        await page.keyboard.press('Alt+p')
        await expect(purchaseOrderLineRows(page, 'item_lines')).toHaveCount(1)
        const product1 = await purchaseOrderLineRowId(page, 'item_lines', 0)
        const item1 = purchaseOrderCell(page, 'item_lines', product1)
        await pickByTyping(page, 'Wireless', ACCESS_POINT)
        await expect(item1('product')).toContainText(ACCESS_POINT)
        await expect(item1('description')).toHaveValue(ACCESS_POINT_DESCRIPTION)
        await expect(item1('description')).toBeFocused()
        await tabTo(page, item1('quantity'))
        await page.keyboard.type('3')
        await tabTo(page, item1('rate'))
        await expect(item1('rate')).toHaveValue('121.40')

        // Enter in the last product line's Rate adds product line 2 with its picker open.
        await page.keyboard.press('Enter')
        await expect(purchaseOrderLineRows(page, 'item_lines')).toHaveCount(2)
        const product2 = await purchaseOrderLineRowId(page, 'item_lines', 1)
        const item2 = purchaseOrderCell(page, 'item_lines', product2)
        await pickByTyping(page, 'Cat6', PATCH_CABLE)
        await expect(item2('product')).toContainText(PATCH_CABLE)
        await tabUntil(page, item2('quantity'), 3)
        await page.keyboard.type('10')
        await tabTo(page, item2('rate'))
        await expect(item2('rate')).toHaveValue('3.10')
        await tabTo(page, page.getByTestId(`form-table-item_lines-menu-${product2}`))
        await tabTo(page, page.getByTestId('form-table-item_lines-add'))
        await tabTo(page, page.getByTestId('form-input-message'))
        await page.keyboard.type(message)
        await tabTo(page, page.getByTestId('form-input-memo'))
        await page.keyboard.type(memo)

        // ⌘S saves and replaces the route with the saved order's form.
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(PURCHASE_ORDER_EDIT_URL)
        const number = await purchaseOrderNumberOf(page)
        const id = await purchaseOrderIdFromUrl(page)

        // ⌘↵ saves and closes to the read view.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expectRecordUrl(page, 'purchase-orders', id)
        const readView = visibleOrderPart(page, 'purchase-order-read-only')
        await expect(readView).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-title')).toHaveText(
            `Purchase order ${number}`
        )
        await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Open')
        await expect(readView.getByTestId('purchase-order-detail-vendor')).toContainText(METRO.name)
        await expect(readView.getByTestId('purchase-order-detail-email')).toContainText(METRO.email)
        await expect(readView.getByTestId('purchase-order-detail-date')).toContainText(
            formatDay(today)
        )
        await expect(readView.getByTestId('purchase-order-detail-ship-to')).toContainText(business)

        // Each line with Ordered, Received 0 and Open (the product grid's columns at 1280).
        const lines = readView.getByTestId('purchase-order-lines')
        for (const heading of ['Ordered', 'Received', 'Open']) {
            await expect(lines).toContainText(heading)
        }
        await expect(readView.locator('[data-testid^="purchase-order-read-line-"]')).toHaveCount(3)
        await expect(readLine(page, 'Freight to the annex')).toContainText(money(4_500))
        // innerText: the grid's cells are divs with no text between them in textContent.
        await expect(readLine(page, ACCESS_POINT)).toContainText(
            /Wi-Fi 6E[\s\S]*\b3\s+0\s+3\b[\s\S]*121\.40[\s\S]*\$364\.20/,
            { useInnerText: true }
        )
        await expect(readLine(page, PATCH_CABLE)).toContainText(
            /\b10\s+0\s+10\b[\s\S]*3\.10[\s\S]*\$31\.00/,
            { useInnerText: true }
        )
        // 45.00 + 364.20 + 31.00; nothing is billed, so no Billed row.
        await expect(readView.getByTestId('purchase-order-total')).toContainText(money(44_020))
        await expect(readView.getByTestId('purchase-order-total-open')).toContainText(money(44_020))
        await expect(readView.getByTestId('purchase-order-total-billed')).toHaveCount(0)
        await expect(readView.getByTestId('purchase-order-created-by')).toContainText('Created by')
        await expect(readView).toContainText(message)

        // At 1280 the line grid fits: it never scrolls sideways.
        await expect.poll(() => lines.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    })

    test('an open purchase order is edited from the keyboard only', async ({ page }) => {
        const memo = uniqueMemo('Purchase order keyboard edit')
        const copyMemo = uniqueMemo('Purchase order keyboard copy')
        const message = 'Leave the boxes with reception.'
        await openBooks(page)
        const today = await localToday(page)

        // Setup through the form (clicks allowed): 80.00 on account line 1, two access
        // points (2 × 121.40).
        const order = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '80.00',
            memo,
            message,
            product: { name: ACCESS_POINT, quantity: '2' },
        })
        await expect(
            visibleOrderPart(page, 'purchase-order-read-only').getByTestId('purchase-order-total')
        ).toContainText(money(32_280))

        // From here on, keys only. E opens the form.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(PURCHASE_ORDER_EDIT_URL)
        await expect(visibleOrderPart(page, 'purchase-order-form')).toBeVisible()
        const vendor = page.getByTestId('form-input-vendor')
        await expect(vendor).toBeFocused()

        const product1 = await purchaseOrderLineRowId(page, 'item_lines', 0)
        const quantity = purchaseOrderCell(page, 'item_lines', product1)('quantity')
        await tabUntil(page, quantity)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('4')
        await expect(quantity).toHaveValue('4')

        // ⌥↵ adds an account line with its picker open.
        await page.keyboard.press('Alt+Enter')
        await expect(purchaseOrderLineRows(page, 'account_lines')).toHaveCount(2)
        const line2 = await purchaseOrderLineRowId(page, 'account_lines', 1)
        const account2 = purchaseOrderCell(page, 'account_lines', line2)
        await pickByTyping(page, 'Rent', '6100 Rent')
        await expect(account2('account')).toContainText('6100 Rent')
        await expect(account2('description')).toBeFocused()
        await tabTo(page, account2('amount'))
        await page.keyboard.type('20.00')

        // ⌘S saves and stays on the form.
        const saved = batchAnswered(page, 'books_purchase_orders', 'PATCH', 200)
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await expect(page).toHaveURL(PURCHASE_ORDER_EDIT_URL)
        await expect(visibleOrderPart(page, 'purchase-order-form')).toBeVisible()

        // ⌥2 shows the PDF view; ⌥1 the form; ⌘P downloads the order's PDF.
        await page.keyboard.press('Alt+2')
        await expect(visibleOrderPart(page, 'purchase-order-tab-pdf')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(visibleOrderPart(page, 'purchase-order-pdf')).toBeVisible()
        await page.keyboard.press('Alt+1')
        await expect(visibleOrderPart(page, 'purchase-order-tab-edit')).toHaveAttribute(
            'aria-selected',
            'true'
        )
        await expect(visibleOrderPart(page, 'purchase-order-form')).toBeVisible()
        const download = page.waitForEvent('download')
        await page.keyboard.press('ControlOrMeta+p')
        expect((await download).suggestedFilename()).toBe(`purchase-order-${order.number}.pdf`)

        // Esc leaves the clean form for the read view: 80.00 + 4 × 121.40 + 20.00.
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expectRecordUrl(page, 'purchase-orders', order.id)
        const readView = visibleOrderPart(page, 'purchase-order-read-only')
        await expect(readView).toBeVisible()
        await expect(readView.getByTestId('purchase-order-total')).toContainText(money(58_560))

        // C copies the order: today's date, the same vendor, lines and message.
        await page.keyboard.press('c')
        await expect(page).toHaveURL(/\/books\/purchase-orders\/new\?copy=[^&#]+$/)
        await expect(visibleOrderPart(page, 'purchase-order-title')).toHaveText(
            'New purchase order'
        )
        await expect(vendor).toBeFocused()
        await expect(vendor).toContainText(OFFICE_SUPPLY.name)
        await expect(page.getByTestId('form-input-date')).toHaveValue(today)
        await expect(page.getByTestId('form-input-message')).toHaveValue(message)
        await expect(purchaseOrderLineRows(page, 'account_lines')).toHaveCount(2)
        await expect(purchaseOrderLineRows(page, 'item_lines')).toHaveCount(1)
        const copied = await purchaseOrderLineRowId(page, 'item_lines', 0)
        const copiedItem = purchaseOrderCell(page, 'item_lines', copied)
        await expect(copiedItem('product')).toContainText(ACCESS_POINT)
        await expect(copiedItem('quantity')).toHaveValue('4')
        const memoInput = page.getByTestId('form-input-memo')
        await tabUntil(page, memoInput)
        await page.keyboard.type(copyMemo)

        // ⌘⇧↵ saves the copy and opens a blank form with focus in Vendor.
        await page.keyboard.press('ControlOrMeta+Shift+Enter')
        await expect(page).toHaveURL(NEW_PURCHASE_ORDER_URL)
        await expect(page).not.toHaveURL(/copy=/)
        await expect(visibleOrderPart(page, 'purchase-order-title')).toHaveText(
            'New purchase order'
        )
        await expect(vendor).toBeFocused()
        await expect(vendor).not.toContainText(OFFICE_SUPPLY.name)

        // Esc leaves the clean form; the palette finds the copy by its memo.
        await page.keyboard.press('Escape')
        await expect(page).not.toHaveURL(NEW_PURCHASE_ORDER_URL)
        await openPurchaseOrderBySearch(page, copyMemo)
        await expectNotRecordUrl(page, 'purchase-orders', order.id)
        const copyNumber = await purchaseOrderNumberOf(page)
        expect(copyNumber).not.toBe(order.number)
        await expect(
            visibleOrderPart(page, 'purchase-order-read-only').getByTestId('purchase-order-total')
        ).toContainText(money(58_560))
    })
})
