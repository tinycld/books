import { expect, type Page, test } from '@playwright/test'
import { batchDialogCopy, batchResultText } from '../../tinycld/books/lib/document-batch'
import { uniqueMemo } from './invoice-helpers'
import {
    draftBillFor,
    openPurchaseRowMenu,
    openPurchases,
    pickPurchaseVendor,
    postedBillFor,
    purchaseRow,
    refusePurchaseWrite,
} from './purchase-lists-helpers'
import { DESKTOP, openBooks, PHONE } from './record-form-helpers'
import { createVendor, uniqueName, vendorHelpers } from './vendor-form-helpers'

// The purchase lists' batch actions (purchase-lists checkpoint 4, spec §3 "Batch actions"
// and "Row menu"): the tick boxes and tick-all, the Batch actions confirm dialog with its
// counts, the one-at-a-time result with the refused documents kept ticked, the selection
// kept by a sort and cleared by a chip, no tick box in the names column, and the phone's
// icon button with Select all and Clear selection and a card's Delete draft. Every test
// creates its own vendor and bills, dated today, and finds its rows through the vendor
// picker.
//
// Not covered by e2e (accepted, plan checkpoint 4):
// - the 50-row window growing (the hook test of checkpoint 1 covers it with 120 rows);
// - the "No bills yet" state (the shared e2e database always holds bills; `emptyTexts` is
//   unit-tested and gate 2 compares the `empty-*` shots);
// - the chip matrix beyond Draft and Overdue, the row menu of a void row, of an expense
//   and of a vendor refund, and the vendor refund's Void text (unit case tables);
// - the pending state of a confirm dialog (the shared dialog, proven by
//   tests/e2e/sales-lists-actions.spec.ts);
// - the vendor picker's load error with Retry (`SearchPicker`'s own state, proven for the
//   same component by tests/e2e/sales-lists-filters.spec.ts);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const WIDE = { width: 1440, height: 900 }

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^purchases-row-[a-z0-9]{15}$/).filter({ visible: true })
}

function tick(page: Page, id: string) {
    return visible(page, `purchases-tick-${id}`)
}

async function expectTicked(page: Page, id: string, ticked: boolean) {
    await expect(tick(page, id)).toHaveAttribute('aria-checked', ticked ? 'true' : 'false')
}

// Books must be open at desktop width. Creates a vendor with a unique name and saves its
// draft bills and posted bills, each with a unique memo; ends on the Vendors list.
async function vendorWithBillDocuments(page: Page, input: { drafts: number; posted: number }) {
    const name = uniqueName('Batch vendor')
    await createVendor(page, { name })
    await vendorHelpers.openList(page)
    const drafts: string[] = []
    for (let n = 0; n < input.drafts; n += 1) {
        drafts.push(await draftBillFor(page, name, uniqueMemo(`Batch draft ${n}`)))
    }
    const posted: string[] = []
    for (let n = 0; n < input.posted; n += 1) {
        posted.push(await postedBillFor(page, name, uniqueMemo(`Batch posted ${n}`)))
    }
    return { name, drafts, posted }
}

test.describe('purchase-lists: batch actions', () => {
    test('deletes drafts and voids in a batch from the table', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { name, drafts, posted } = await vendorWithBillDocuments(page, {
            drafts: 2,
            posted: 1,
        })
        const [firstDraft, secondDraft] = drafts
        const [bill] = posted
        if (firstDraft === undefined || secondDraft === undefined || bill === undefined) {
            throw new Error('bills not made')
        }

        await openPurchases(page)
        await pickPurchaseVendor(page, name)
        await expect(listRows(page)).toHaveCount(3)

        // Nothing ticked: Batch actions is disabled. Tick-all ticks the three rows.
        await expect(visible(page, 'purchases-batch-actions')).toBeDisabled()
        await visible(page, 'purchases-tick-all').click()
        for (const id of [firstDraft, secondDraft, bill]) await expectTicked(page, id, true)
        await expect(visible(page, 'purchases-batch-actions')).toBeEnabled()

        // A sort keeps the ticks.
        const date = visible(page, 'purchases-header-date')
        await date.click()
        await expect(date).toHaveAttribute('aria-sort', 'ascending')
        for (const id of [firstDraft, secondDraft, bill]) await expectTicked(page, id, true)

        // Delete drafts names the 2 drafts it deletes and the 1 document it skips.
        const deleteCopy = batchDialogCopy('delete_drafts', 2, 1)
        await visible(page, 'purchases-batch-actions').click()
        await visible(page, 'purchases-batch-delete-drafts').click()
        const dialog = visible(page, 'purchases-batch-dialog')
        await expect(dialog).toContainText('Delete 2 drafts?')
        await expect(dialog).toContainText(deleteCopy.body)
        await visible(page, 'purchases-batch-confirm').click()
        await expect(page.getByTestId('purchases-batch-dialog')).toHaveCount(0)
        await expect(purchaseRow(page, firstDraft)).toHaveCount(0)
        await expect(purchaseRow(page, secondDraft)).toHaveCount(0)
        await expect(listRows(page)).toHaveCount(1)
        await expectTicked(page, bill, true)

        // Void with the server refusing the bill's PATCH: none done, one refused with the
        // server's text, and the bill stays ticked and not void.
        const refusal = 'The period is closed.'
        const refused = await refusePurchaseWrite(page, 'books_bills', bill, 'PATCH', refusal)
        await visible(page, 'purchases-batch-actions').click()
        await visible(page, 'purchases-batch-void').click()
        await expect(dialog).toContainText(batchDialogCopy('void', 1, 0).title)
        await visible(page, 'purchases-batch-confirm').click()
        await refused.response
        await expect(page.getByTestId('purchases-batch-dialog')).toHaveCount(0)
        await expect(visible(page, 'purchases-banner')).toContainText(batchResultText(0, [refusal]))
        await expectTicked(page, bill, true)
        await expect(visible(page, `purchases-status-${bill}`)).not.toHaveText('Void')

        // With the route gone, Void again: one done, the row reads Void and is not ticked.
        await page.unrouteAll({ behavior: 'wait' })
        await visible(page, 'purchases-batch-actions').click()
        await visible(page, 'purchases-batch-void').click()
        await visible(page, 'purchases-batch-confirm').click()
        await expect(page.getByTestId('purchases-batch-dialog')).toHaveCount(0)
        await expect(visible(page, 'purchases-banner')).toContainText(batchResultText(1, []))
        await expect(visible(page, `purchases-status-${bill}`)).toHaveText('Void')
        await expectTicked(page, bill, false)

        // A chip clears the selection.
        await tick(page, bill).click()
        await expectTicked(page, bill, true)
        await visible(page, 'purchases-chip-void').click()
        await expect(visible(page, 'purchases-chip-void')).toHaveAttribute('aria-pressed', 'true')
        await expect(purchaseRow(page, bill)).toBeVisible()
        await expectTicked(page, bill, false)

        // At 1440 with the bill open beside, the names column draws no tick box.
        await page.setViewportSize(WIDE)
        await expect(visible(page, 'purchases-table')).toBeVisible()
        await purchaseRow(page, bill).click()
        await expect(page).toHaveURL(new RegExp(`/books/bills/${bill}$`))
        const column = visible(page, 'purchases-names')
        await expect(column).toBeVisible()
        await expect(column.getByTestId(`purchases-name-row-${bill}`)).toBeVisible()
        await expect(visible(page, `purchases-tick-${bill}`)).toHaveCount(0)
        await expect(visible(page, 'purchases-tick-all')).toHaveCount(0)
    })

    test('selects, voids and deletes from the cards on a phone', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const { name, drafts, posted } = await vendorWithBillDocuments(page, {
            drafts: 1,
            posted: 1,
        })
        const [draft] = drafts
        const [bill] = posted
        if (draft === undefined || bill === undefined) throw new Error('bills not made')

        await openPurchases(page)
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'purchases-cards')).toBeVisible()
        await pickPurchaseVendor(page, name)
        await expect(listRows(page)).toHaveCount(2)

        // The icon button is enabled with nothing ticked; its Delete drafts and Void are not.
        const batch = visible(page, 'purchases-batch-actions')
        await expect(batch).toBeEnabled()
        await batch.click()
        await expect(visible(page, 'purchases-batch-delete-drafts')).toHaveAttribute(
            'aria-disabled',
            'true'
        )
        await expect(visible(page, 'purchases-batch-void')).toHaveAttribute('aria-disabled', 'true')

        // Select all ticks both cards; Clear selection unticks them.
        await visible(page, 'purchases-batch-select-all').click()
        await expectTicked(page, draft, true)
        await expectTicked(page, bill, true)
        await batch.click()
        await visible(page, 'purchases-batch-clear').click()
        await expectTicked(page, draft, false)
        await expectTicked(page, bill, false)

        // With only the draft ticked, Void applies to none: the dialog says so and has no
        // confirm button.
        await tick(page, draft).click()
        await expectTicked(page, draft, true)
        await batch.click()
        await visible(page, 'purchases-batch-void').click()
        const noneCopy = batchDialogCopy('void', 0, 1)
        const dialog = visible(page, 'purchases-batch-dialog')
        await expect(dialog).toContainText(noneCopy.title)
        await expect(dialog).toContainText(noneCopy.body)
        await expect(visible(page, 'purchases-batch-close')).toBeVisible()
        await expect(page.getByTestId('purchases-batch-confirm')).toHaveCount(0)
        await visible(page, 'purchases-batch-close').click()
        await expect(page.getByTestId('purchases-batch-dialog')).toHaveCount(0)

        // The draft card's row menu deletes it; the posted card stays.
        await openPurchaseRowMenu(page, draft)
        await visible(page, 'purchases-row-action-delete-draft').click()
        await expect(visible(page, 'purchases-delete-dialog')).toBeVisible()
        await visible(page, 'purchases-delete-confirm').click()
        await expect(page.getByTestId('purchases-delete-dialog')).toHaveCount(0)
        await expect(purchaseRow(page, draft)).toHaveCount(0)
        await expect(purchaseRow(page, bill)).toBeVisible()
        await expect(listRows(page)).toHaveCount(1)
    })
})
