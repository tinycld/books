import { expect, type Page, test } from '@playwright/test'
// The bill payment's Void texts, from the import-free leaf that `PAY_BILLS_MESSAGES.voidBody`
// and `.voidConfirm` read (lib/pay-bills-texts.ts itself cannot load here: its chain reaches
// `@tinycld/core/lib/logger`). A bill's Void body ends after "The number is kept.", so this
// body tells the two apart.
import {
    BILL_PAYMENT_VOID_BODY,
    BILL_PAYMENT_VOID_CONFIRM,
} from '../../tinycld/books/lib/pay-bills-void-texts'
import {
    BILL_PAYMENT_URL,
    billPaymentIdFromUrl,
    CHECKING,
    filterToVendor,
    localDay,
    openPayBills,
    payBillsRowAmount,
    pickSelect,
    postedNumber,
    replacesUrl,
    vendorWithBills,
} from './pay-bills-helpers'
import {
    openPurchaseRowMenu,
    openPurchases,
    openPurchaseTab,
    pickPurchaseVendor,
    purchaseRow,
    purchaseRowMenuActions,
    purchaseTabUrl,
    refusePurchaseWrite,
} from './purchase-lists-helpers'
import { DESKTOP, openBooks } from './record-form-helpers'
import { applyDialog } from './vendor-credit-helpers'

// The purchase lists' row menus (purchase-lists checkpoint 4, spec §3 "Row menu" and
// "Opening a document"): the "More actions" menu of a row with the read view's actions in
// its order and with its labels, no Edit; a navigating action (Pay bill, Apply to bills) and
// its way back; Void from the menu with a server refusal in the list's banner; a bill
// payment's Edit over the list beside it, a saved correction whose Back returns to the
// Bill payments list (not to the void original), and the correction's own Void text from
// its row menu. Test 1 only reads the
// seeded rows (PURCHASE_LIST_SEED) and lands no write; test 2 makes its own vendor, bill
// and bill payment.
//
// Not covered by e2e (accepted, plan checkpoint 4):
// - the 50-row window growing (the hook test of checkpoint 1 covers it with 120 rows);
// - the "No bills yet" state (the shared e2e database always holds bills; `emptyTexts` is
//   unit-tested and gate 2 compares the `empty-*` shots);
// - the chip matrix beyond Draft and Overdue, the row menu of a void row, of an expense
//   and of a vendor refund, and the vendor refund's Void text (unit case tables,
//   tests/purchase-row-menu.test.ts);
// - the pending state of a confirm dialog (the shared dialog, proven by
//   tests/e2e/sales-lists-actions.spec.ts);
// - the vendor picker's load error with Retry (`SearchPicker`'s own state, proven for the
//   same component by tests/e2e/sales-lists-filters.spec.ts);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const WIDE = { width: 1440, height: 900 }

const NW_PAPER = 'Northwest Paper Co.'
const ZENITH = 'Zenith Telecom'
const BILL_1057 = 'plbill000001057'
const DRAFT_BILL = 'plbill00000draf'
const CREDIT_31 = 'plvc00000000031'

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^purchases-row-[a-z0-9]{15}$/).filter({ visible: true })
}

// The ids of the visible rows, in list order, read in one snapshot.
function rowIds(page: Page): Promise<string[]> {
    return listRows(page).evaluateAll(rows =>
        rows.map(row => (row.getAttribute('data-testid') ?? '').replace(/^purchases-row-/, ''))
    )
}

// How many `testId` elements a user can see or reach: shown, and under no `aria-hidden`
// or `inert` ancestor (a list stays mounted, covered and inert, under a pushed page).
function reachableCount(page: Page, testId: string): Promise<number> {
    return page.evaluate(
        id =>
            Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)).filter(
                el => el.checkVisibility() && el.closest('[aria-hidden="true"], [inert]') === null
            ).length,
        testId
    )
}

async function closeRowMenu(page: Page) {
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('purchases-row-action-open')).toHaveCount(0)
}

test.describe('purchase-lists: row menus', () => {
    test("a row menu runs the read view's actions, and a refusal shows in the banner", async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openPurchases(page)
        await pickPurchaseVendor(page, ZENITH)
        await expect(purchaseRow(page, BILL_1057)).toBeVisible()

        // The menu press leaves the list on screen; the posted bill's actions, in the read
        // view's order and with its labels, with no Edit.
        await openPurchaseRowMenu(page, BILL_1057)
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await expect
            .poll(() => purchaseRowMenuActions(page))
            .toEqual(['open', 'pay-bill', 'void', 'copy', 'entry'])
        await expect(visible(page, 'purchases-row-action-pay-bill')).toContainText('Pay bill')
        await expect(visible(page, 'purchases-row-action-entry')).toContainText(
            'View journal entry'
        )

        // Pay bill opens Pay Bills for this bill; its back link returns to the list (the
        // filled payment asks to be discarded first).
        await visible(page, 'purchases-row-action-pay-bill').click()
        await expect(page).toHaveURL(new RegExp(`/books/pay-bills\\?bill=${BILL_1057}$`))
        await visible(page, 'entry-back').click()
        await page.getByTestId('discard-confirm').click()
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await expect(visible(page, 'purchases-list')).toBeVisible()
        await expect(purchaseRow(page, BILL_1057)).toBeVisible()

        // Void with the server refusing the bill's PATCH: the dialog opens over the list and
        // closes on the refusal, which shows in the banner; the bill is not void.
        const refusal = 'The period is closed.'
        const refused = await refusePurchaseWrite(page, 'books_bills', BILL_1057, 'PATCH', refusal)
        await openPurchaseRowMenu(page, BILL_1057)
        await visible(page, 'purchases-row-action-void').click()
        await expect(visible(page, 'void-dialog')).toBeVisible()
        await expect(page).toHaveURL(purchaseTabUrl('all'))
        await visible(page, 'void-confirm').click()
        await refused.response
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(visible(page, 'purchases-banner')).toContainText(refusal)
        await page.unrouteAll({ behavior: 'wait' })
        await openPurchaseRowMenu(page, BILL_1057)
        await expect(visible(page, 'purchases-row-action-void')).toBeVisible()
        await closeRowMenu(page)

        // The draft bill's menu holds Open and Delete draft only.
        await pickPurchaseVendor(page, NW_PAPER)
        await expect(purchaseRow(page, DRAFT_BILL)).toBeVisible()
        await openPurchaseRowMenu(page, DRAFT_BILL)
        await expect.poll(() => purchaseRowMenuActions(page)).toEqual(['open', 'delete-draft'])
        await closeRowMenu(page)

        // The posted vendor credit's menu, on the Vendor credits tab.
        await openPurchaseTab(page, 'vendor-credits')
        await pickPurchaseVendor(page, NW_PAPER)
        await expect(purchaseRow(page, CREDIT_31)).toBeVisible()
        await openPurchaseRowMenu(page, CREDIT_31)
        await expect
            .poll(() => purchaseRowMenuActions(page))
            .toEqual(['open', 'apply-credit', 'record-refund', 'void', 'copy', 'entry'])
        await expect(visible(page, 'purchases-row-action-apply-credit')).toContainText(
            'Apply to bills'
        )
        await expect(visible(page, 'purchases-row-action-record-refund')).toContainText(
            'Record refund'
        )

        // Apply to bills opens the credit with its Apply dialog; the test closes it unwritten.
        await visible(page, 'purchases-row-action-apply-credit').click()
        await expect(page).toHaveURL(new RegExp(`/books/vendor-credits/${CREDIT_31}$`))
        await expect(applyDialog(page)).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(applyDialog(page)).toHaveCount(0)
    })

    test("a bill payment: Edit covers the list, a correction's Back returns to the list, and Void asks with its own text", async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { vendor, bills } = await vendorWithBills(page, {
            bills: [{ amount: '200.00', due: await localDay(page, 10) }],
        })
        const [bill] = bills
        if (bill === undefined) throw new Error('bill not posted')

        // Pay the bill in full by bank transfer.
        await openPayBills(page)
        await pickSelect(page, 'pay-bills-paid-from', CHECKING)
        await pickSelect(page, 'pay-bills-method', 'Bank transfer')
        await filterToVendor(page, vendor)
        await page.getByTestId(`pay-bills-row-tick-${bill.id}`).click()
        await expect(payBillsRowAmount(page, bill.id)).toHaveValue('200.00')
        await page.getByTestId('pay-bills-pay').click()
        await postedNumber(page)

        // The Bill payments tab narrowed to the vendor lists the one payment.
        await openPurchases(page)
        await openPurchaseTab(page, 'bill-payments')
        await pickPurchaseVendor(page, vendor.name)
        await expect(listRows(page)).toHaveCount(1)
        const [paymentId] = await rowIds(page)
        if (paymentId === undefined) throw new Error('payment not listed')

        // At 1440 a press on the row shows the read view beside the names column.
        await page.setViewportSize(WIDE)
        await expect(visible(page, 'purchases-table')).toBeVisible()
        await purchaseRow(page, paymentId).click()
        await expect(page).toHaveURL(new RegExp(`/books/bill-payments/${paymentId}$`))
        await expect(visible(page, 'purchases-names')).toBeVisible()
        await expect(visible(page, 'bill-payment-title')).toBeVisible()

        // Edit (the read view's E) opens Pay Bills over the whole screen; Back shows the read
        // view beside the column again.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(replacesUrl(paymentId))
        await expect(visible(page, 'pay-bills-title')).toBeVisible()
        await expect.poll(() => reachableCount(page, 'purchases-names')).toBe(0)
        await page.goBack()
        await expect(page).toHaveURL(new RegExp(`/books/bill-payments/${paymentId}$`))
        await expect(visible(page, 'purchases-names')).toBeVisible()
        await expect(visible(page, 'bill-payment-title')).toBeVisible()

        // Edit again and save a correction of 150.00: Back from the correction returns to
        // the Bill payments list, not to the void original.
        await page.keyboard.press('e')
        await expect(page).toHaveURL(replacesUrl(paymentId))
        await payBillsRowAmount(page, bill.id).fill('150.00')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(BILL_PAYMENT_URL)
        const correctionId = billPaymentIdFromUrl(page)
        expect(correctionId).not.toBe(paymentId)
        await page.goBack()
        await expect(page).toHaveURL(purchaseTabUrl('bill-payments'))
        await expect.poll(() => reachableCount(page, 'purchases-list')).toBe(1)

        // At 1280, on the tab's table: Void from the correction's row menu asks with the bill
        // payment's own text, and voids it.
        await page.setViewportSize(DESKTOP)
        await expect(visible(page, 'purchases-table')).toBeVisible()
        await expect(purchaseRow(page, correctionId)).toBeVisible()
        await openPurchaseRowMenu(page, correctionId)
        await expect.poll(() => purchaseRowMenuActions(page)).toEqual(['open', 'void', 'entry'])
        await visible(page, 'purchases-row-action-void').click()
        const dialog = visible(page, 'void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(BILL_PAYMENT_VOID_BODY)
        await expect(visible(page, 'void-confirm')).toContainText(BILL_PAYMENT_VOID_CONFIRM)
        await visible(page, 'void-confirm').click()
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(visible(page, `purchases-status-${correctionId}`)).toHaveText('Void')
        await openPurchaseRowMenu(page, correctionId)
        await expect.poll(() => purchaseRowMenuActions(page)).toEqual(['open', 'entry'])
    })
})
