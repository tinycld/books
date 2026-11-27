import { expect, type Page, test } from '@playwright/test'
import { waitForEmailTo } from '@tinycld/core/e2e-helpers'
import { formatDay } from '../../tinycld/books/lib/register-range'
import { VENDOR_IDS, VENDORS } from '../../tinycld/books/lib/vendor-form-fixture'
import { DESKTOP, isPhone, PHONE, showListsHub } from './account-register-helpers'
import { businessName, emailBody, sendDialog, todayWords } from './email-share-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import {
    openPurchaseRowMenu,
    openPurchaseTab,
    purchaseRowMenuActions,
    purchaseTabUrl,
    searchPurchases,
} from './purchase-lists-helpers'
import {
    BILL_FROM_ORDER_URL,
    copyToBillDialog,
    makePurchaseOrder,
    openPurchaseOrderBySearch,
    openPurchaseOrdersTab,
    PURCHASE_ORDER_URL,
    purchaseOrderRow,
    submitCopyToBill,
    visibleOrderPart,
} from './purchase-order-helpers'
import { openBooks } from './record-form-helpers'
import { expectRecordUrl } from './record-key-helpers'
import { uniqueEmail } from './statements-helpers'
import { openVendorsList, searchVendors, vendorEntry } from './vendor-form-helpers'

// The purchase order lists and the read view's Close, Reopen and Send… (purchase order
// spec §3.6, §3.9, §3.12), checkpoint 5: the Purchase orders tab of the Expenses area (its
// row, chips, sort, row menu, batch bar, delete and no-match state), All purchases, the
// vendor page's Purchase orders chip and New transaction item, search, Close (X and the
// row menu), Reopen (U), the bill's cannot-start notice, Send… (S) with its sent line and
// the email, and the list cards at 390. Every order is made by the spec through the form
// with a unique memo and reopened through search; no seeded order is changed, and numbers
// are read from the titles.
//
// Not driven here, and why (cp5 brief, E2E budget): the reader's menus and read view and a
// non-admin's Close (role-bound: unit cases of purchaseRowMenuItems and orderReadActions,
// and Go tests), the "No purchase orders yet" state (the seeded book always has orders;
// `emptyTexts` is unit-tested), the loading and load-error states (the list layer's, proven
// by tests/e2e/purchase-lists-states.spec.ts), and the batch Send dialog's own flow (the
// shared BatchSendDialog, proven by the email-share list specs).

function vendorOf(id: string) {
    const row = VENDORS.find(vendor => vendor.id === id)
    if (!row) throw new Error(`no vendor ${id}`)
    return { id: row.id, name: row.display_name }
}

// Office Supply World: default expense account 6210 Design Tools (lib/vendor-form-fixture.ts),
// which fills account line 1.
const OFFICE_SUPPLY = vendorOf(VENDOR_IDS.officeSupply)

const NOTHING_LEFT = 'This purchase order has nothing left to copy to a bill.'

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function readView(page: Page) {
    return visibleOrderPart(page, 'purchase-order-read-only')
}

// The ids of the visible list's rows in screen order, in one snapshot.
function listRowIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="purchases-row-"]'))
            .filter(el => el.checkVisibility())
            .map(el => /^purchases-row-([a-z0-9]{15})$/.exec(el.dataset.testid ?? '')?.[1])
            .filter((id): id is string => id !== undefined)
    )
}

// Whether the page scrolls sideways (tests/e2e/purchase-order-form.spec.ts).
function pageScrollsSideways(page: Page): Promise<boolean> {
    return page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
}

// From anywhere in Books to a vendor's page: the Lists tab, the Vendors list, the vendor's
// row (the steps of openFromRow in tests/e2e/vendor-pages-transactions.spec.ts).
async function openVendorPage(page: Page, name: string) {
    const listsTab = page
        .getByTestId('books-list-card-vendors')
        .or(page.getByTestId('vendors-list'))
        .or(page.getByTestId('vendor-back'))
        .filter({ visible: true })
    if ((await listsTab.count()) === 0) {
        if (isPhone(page)) await showListsHub(page)
        else await page.getByTestId('books-nav-lists').click()
        await expect(listsTab.first()).toBeVisible()
    }
    await openVendorsList(page)
    await searchVendors(page, name)
    await vendorEntry(page, name).click()
    await expect(page.getByTestId('vendor-title')).toHaveText(name)
    await expect(page.getByTestId('vendor-transactions')).toBeVisible()
}

// The read view of an open order must show. The Close dialog by X; it names the number.
async function closeByKey(page: Page, number: string) {
    await expect(visibleOrderPart(page, 'purchase-order-read-close')).toBeVisible()
    await page.keyboard.press('x')
    const dialog = visible(page, 'close-purchase-order-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(`Close purchase order ${number}?`)
    return dialog
}

async function expectClosed(page: Page) {
    await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Closed')
    await expect(visibleOrderPart(page, 'purchase-order-closed')).toContainText(/^Closed by \S/)
    await expect(visibleOrderPart(page, 'purchase-order-read-edit')).toHaveCount(0)
    await expect(visibleOrderPart(page, 'purchase-order-read-copy-to-bill')).toHaveCount(0)
    await expect(visibleOrderPart(page, 'purchase-order-read-reopen')).toBeVisible()
}

// The read view of an order closed by hand must show. Reopen by U.
async function reopenByKey(page: Page) {
    await expect(visibleOrderPart(page, 'purchase-order-read-reopen')).toBeVisible()
    await page.keyboard.press('u')
    await expect(visibleOrderPart(page, 'purchase-order-badge')).toHaveText('Open')
    await expect(visibleOrderPart(page, 'purchase-order-closed')).toHaveCount(0)
    await expect(visibleOrderPart(page, 'purchase-order-read-close')).toBeVisible()
}

test.describe('purchase-orders: lists and actions', () => {
    test('the tab, the row menu, All purchases, the vendor page and search', async ({ page }) => {
        const memo = uniqueMemo('PO lists')
        const memoA = `${memo}-a`
        const memoB = `${memo}-b`
        await openBooks(page, DESKTOP)
        const first = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '45.00',
            memo: memoA,
        })
        const second = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '120.00',
            memo: memoB,
        })

        // The tab comes right after Bills, and lists the order with its Open and Total.
        await openPurchaseOrdersTab(page)
        await expect(page).toHaveURL(purchaseTabUrl('purchase-orders'))
        const tabs = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="purchases-tab-"]'))
                .filter(el => el.checkVisibility())
                .map(el => el.dataset.testid?.slice('purchases-tab-'.length))
        )
        expect(tabs.indexOf('purchase-orders')).toBe(tabs.indexOf('bills') + 1)
        await searchPurchases(page, memo)
        await expect(purchaseOrderRow(page, first.id)).toContainText(first.number)
        await expect(purchaseOrderRow(page, first.id)).toContainText(OFFICE_SUPPLY.name)
        await expect(purchaseOrderRow(page, first.id)).toContainText('$45.00')
        await expect(visible(page, `purchases-status-${first.id}`)).toHaveText('Open')
        await expect(purchaseOrderRow(page, second.id)).toContainText('$120.00')

        // Closed hides the open orders; Open shows them.
        await visible(page, 'purchases-chip-closed').click()
        await expect(visible(page, 'purchases-chip-closed')).toHaveAttribute('aria-pressed', 'true')
        await expect(purchaseOrderRow(page, first.id)).toHaveCount(0)
        await expect(purchaseOrderRow(page, second.id)).toHaveCount(0)
        await visible(page, 'purchases-chip-open').click()
        await expect(visible(page, 'purchases-chip-open')).toHaveAttribute('aria-pressed', 'true')
        await expect(purchaseOrderRow(page, first.id)).toBeVisible()

        // Sort by Open: $45.00 before $120.00, then the other way.
        const open = visible(page, 'purchases-header-open')
        await open.click()
        await expect(open).toHaveAttribute('aria-sort', 'ascending')
        await expect.poll(() => listRowIds(page)).toEqual([first.id, second.id])
        await open.click()
        await expect(open).toHaveAttribute('aria-sort', 'descending')
        await expect.poll(() => listRowIds(page)).toEqual([second.id, first.id])

        // The writer's row menu of an open order with no bill, in the spec's order (the
        // login user is a Books admin, so Close is there too).
        await openPurchaseRowMenu(page, first.id)
        await expect
            .poll(() => purchaseRowMenuActions(page))
            .toEqual(['open', 'copy-to-bill', 'edit', 'send', 'pdf', 'copy', 'close', 'delete'])

        // Copy to bill opens the order with its dialog; Esc, then back to the list.
        await visible(page, 'purchases-row-action-copy-to-bill').click()
        await expect(page).toHaveURL(/\/books\/purchase-orders\/(?!new(?:[?#]|$))[^/?#]+/)
        await expectRecordUrl(page, 'purchase-orders', first.id)
        await expect(copyToBillDialog(page)).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(copyToBillDialog(page)).toHaveCount(0)
        await expect(readView(page)).toBeVisible()
        await page.goBack()
        await expect(page).toHaveURL(purchaseTabUrl('purchase-orders'))
        await expect(purchaseOrderRow(page, first.id)).toBeVisible()

        // Send… opens the send dialog over the list; Cancel closes it.
        await openPurchaseRowMenu(page, first.id)
        await visible(page, 'purchases-row-action-send').click()
        await expect(sendDialog(page)).toBeVisible()
        await expect(
            sendDialog(page).getByText(`Send purchase order ${first.number}`, { exact: true })
        ).toBeVisible()
        await expect(page).toHaveURL(purchaseTabUrl('purchase-orders'))
        await sendDialog(page).getByTestId('document-send-cancel').click()
        await expect(sendDialog(page)).toHaveCount(0)

        // Both orders ticked: Batch actions offers Send and Download PDF only, and Download
        // PDF saves the two PDFs as one archive named by the kind's stem in the plural.
        await visible(page, `purchases-tick-${first.id}`).click()
        await visible(page, `purchases-tick-${second.id}`).click()
        await visible(page, 'purchases-batch-actions').click()
        await expect(visible(page, 'purchases-batch-send')).toBeVisible()
        await expect(visible(page, 'purchases-batch-pdf')).toBeVisible()
        await expect(visible(page, 'purchases-batch-delete-drafts')).toHaveCount(0)
        await expect(visible(page, 'purchases-batch-void')).toHaveCount(0)
        const download = page.waitForEvent('download')
        await visible(page, 'purchases-batch-pdf').click()
        expect((await download).suggestedFilename()).toBe('purchase-orders.zip')

        // Delete on the second order confirms, and its row leaves the list.
        await openPurchaseRowMenu(page, second.id)
        await visible(page, 'purchases-row-action-delete').click()
        const deleteDialog = visible(page, 'purchases-delete-dialog')
        await expect(deleteDialog).toContainText(`Delete purchase order ${second.number}?`)
        await visible(page, 'purchases-delete-confirm').click()
        await expect(page.getByTestId('purchases-delete-dialog')).toHaveCount(0)
        await expect(purchaseOrderRow(page, second.id)).toHaveCount(0)
        await expect(purchaseOrderRow(page, first.id)).toBeVisible()

        // All purchases lists the order as a Purchase order under its Open chip.
        await openPurchaseTab(page, 'all')
        await searchPurchases(page, memoA)
        await visible(page, 'purchases-chip-open').click()
        await expect(visible(page, 'purchases-chip-open')).toHaveAttribute('aria-pressed', 'true')
        await expect(purchaseOrderRow(page, first.id)).toContainText('Purchase order')
        await expect(purchaseOrderRow(page, first.id)).toContainText('$45.00')
        await expect(visible(page, `purchases-status-${first.id}`)).toHaveText('Open')

        // Copy to bill from the All purchases row menu opens the order with its dialog too
        // (spec §3.9), though the order's route mounts the Purchase orders list first.
        await openPurchaseRowMenu(page, first.id)
        await visible(page, 'purchases-row-action-copy-to-bill').click()
        await expectRecordUrl(page, 'purchase-orders', first.id)
        await expect(copyToBillDialog(page)).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(copyToBillDialog(page)).toHaveCount(0)
        await expect(readView(page)).toBeVisible()
        await page.goBack()
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await expect(purchaseOrderRow(page, first.id)).toBeVisible()

        // The vendor's page lists it under the Purchase orders chip; its New transaction
        // menu opens a new order for the vendor.
        await openVendorPage(page, OFFICE_SUPPLY.name)
        await page.getByTestId('vendor-transactions-filter-purchase-order').click()
        const vendorRow = page
            .getByTestId(`vendor-transaction-${first.id}`)
            .filter({ visible: true })
        await expect(vendorRow).toContainText('Purchase order')
        await expect(vendorRow).toContainText(first.number)
        await page.getByTestId('vendor-new-transaction').click()
        await page.getByTestId('vendor-new-purchase-order').click()
        await expect(page).toHaveURL(
            new RegExp(`/books/purchase-orders/new\\?vendor=${OFFICE_SUPPLY.id}$`)
        )
        await expect(visibleOrderPart(page, 'purchase-order-form')).toBeVisible()
        await expect(page.getByTestId('form-input-vendor')).toContainText(OFFICE_SUPPLY.name)
        // Unchanged, so the leave guard does not ask.
        await page.goBack()
        await expect(page.getByTestId('vendor-title')).toHaveText(OFFICE_SUPPLY.name)

        // The search palette finds it by the memo and opens the read view.
        await openPurchaseOrderBySearch(page, memoA)
        await expectRecordUrl(page, 'purchase-orders', first.id)
        await expect(readView(page)).toContainText(memoA)

        // A search that matches nothing in the tab shows the no-match state.
        await openPurchaseOrdersTab(page)
        await searchPurchases(page, uniqueMemo('No such purchase order'))
        await expect(visible(page, 'purchases-no-match')).toBeVisible()
    })

    test('an admin closes and reopens an order, and sends it', async ({ page }) => {
        const memo = uniqueMemo('PO close')
        const email = uniqueEmail('po-send')
        await openBooks(page, DESKTOP)
        const business = await businessName(page)
        const order = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '45.00',
            email,
            memo,
        })

        // B and Create bill: the bill form opens from the order, unchanged; back to it.
        await expect(visibleOrderPart(page, 'purchase-order-read-copy-to-bill')).toBeVisible()
        await page.keyboard.press('b')
        await expect(copyToBillDialog(page)).toBeVisible()
        // Create bill is enabled only once the dialog has loaded the order's rows (spec §3.7),
        // as purchase-order-copy-to-bill.spec.ts waits for the total before ⌘↵.
        await expect(page.getByTestId('copy-to-bill-total')).toHaveText('Bill total $45.00')
        await submitCopyToBill(page, order.number)
        await page.goBack()
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expect(readView(page)).toBeVisible()

        // X: the dialog counts the open line and its amount; confirm closes the order.
        const dialog = await closeByKey(page, order.number)
        await expect(dialog).toContainText(
            '1 line is still open ($45.00). Nothing more can be copied to a bill.'
        )
        await visible(page, 'close-purchase-order-confirm').click()
        await expect(page.getByTestId('close-purchase-order-dialog')).toHaveCount(0)
        await expectClosed(page)

        // Forward to the bill form: the closed order has nothing left to copy.
        await page.goForward()
        await expect(page).toHaveURL(BILL_FROM_ORDER_URL)
        // The notice holds its back link too (DocumentNotice), so its message is contained.
        await expect(visible(page, 'bill-cannot-start')).toContainText(NOTHING_LEFT)
        await page.goBack()
        await expect(page).toHaveURL(PURCHASE_ORDER_URL)
        await expectClosed(page)

        // U: Open again, and the Closed stamp is gone.
        await reopenByKey(page)

        // From the Purchase orders tab, the row menu's Close closes it again.
        await openPurchaseOrdersTab(page)
        await searchPurchases(page, memo)
        await openPurchaseRowMenu(page, order.id)
        await visible(page, 'purchases-row-action-close').click()
        await expect(visible(page, 'close-purchase-order-dialog')).toContainText(
            `Close purchase order ${order.number}?`
        )
        await visible(page, 'close-purchase-order-confirm').click()
        await expect(page.getByTestId('close-purchase-order-dialog')).toHaveCount(0)
        await expect(visible(page, `purchases-status-${order.id}`)).toHaveText('Closed')

        // The row opens the closed order; U reopens it on the read view.
        await purchaseOrderRow(page, order.id).click()
        await expectRecordUrl(page, 'purchase-orders', order.id)
        await expectClosed(page)
        await reopenByKey(page)

        // S: the dialog's To is the order's Email and the subject names the number and the
        // business; the send lists a sent line under the header.
        await expect(visibleOrderPart(page, 'purchase-order-read-send')).toBeVisible()
        await page.keyboard.press('s')
        const send = sendDialog(page)
        await expect(send).toBeVisible()
        const to = send.getByTestId('document-send-to')
        await expect(to).toBeFocused()
        await expect(to).toHaveValue(email)
        const subject = `Purchase order ${order.number} from ${business}`
        await expect(send.getByTestId('document-send-subject')).toHaveValue(subject)
        await expect(emailBody(page).locator('a')).toHaveCount(0)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(sendDialog(page)).toHaveCount(0)
        await expect(visibleOrderPart(page, 'purchase-order-sent-line')).toHaveText(
            `Sent ${await todayWords(page)} to ${email}`
        )

        const sent = await waitForEmailTo(email)
        expect(sent.subject).toBe(subject)
        expect(sent.attachment_names).toEqual([`purchase-order-${order.number}.pdf`])
        expect(sent.html ?? '').not.toContain('/p/books/')
    })

    test('the list cards at 390', async ({ page }) => {
        const memo = uniqueMemo('PO cards')
        await openBooks(page, DESKTOP)
        const today = await localToday(page)
        const order = await makePurchaseOrder(page, {
            vendor: OFFICE_SUPPLY.name,
            amount: '45.00',
            memo,
        })
        await openPurchaseOrdersTab(page)
        await searchPurchases(page, memo)
        await expect(purchaseOrderRow(page, order.id)).toBeVisible()

        // At 390 the tab draws cards: vendor and total; number, date and badge; the Open
        // line while the order has an open amount.
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'purchases-cards')).toBeVisible()
        await expect(visible(page, 'purchases-table')).toHaveCount(0)
        const card = purchaseOrderRow(page, order.id)
        await expect(card).toContainText(OFFICE_SUPPLY.name)
        await expect(card).toContainText('$45.00')
        await expect(card).toContainText(`${order.number} · ${formatDay(today)}`)
        await expect(visible(page, `purchases-status-${order.id}`)).toHaveText('Open')
        await expect(card).toContainText('Open $45.00')
        await expect.poll(() => pageScrollsSideways(page)).toBe(false)

        // A card press opens the read view: the primary button, and More with Close.
        await card.click()
        await expectRecordUrl(page, 'purchase-orders', order.id)
        await expect(readView(page)).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-read-copy-to-bill')).toBeVisible()
        await expect(visibleOrderPart(page, 'purchase-order-read-close')).toHaveCount(0)
        await visibleOrderPart(page, 'purchase-order-read-more').click()
        await expect(visible(page, 'purchase-order-read-close')).toBeVisible()
    })
})
