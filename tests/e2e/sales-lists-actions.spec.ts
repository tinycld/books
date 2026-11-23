import { expect, type Page, test } from '@playwright/test'
import { DESKTOP, openBooks, PHONE } from './customer-form-helpers'
import { localToday, uniqueMemo } from './invoice-helpers'
import { customerWithInvoices } from './receive-payment-helpers'
import {
    draftInvoiceFor,
    openRowMenu,
    openSales,
    openSalesTab,
    pickSalesCustomer,
    rowMenuActions,
    salesRow,
    salesTabUrl,
} from './sales-lists-helpers'

// The Sales list's row menus and batch actions (sales-lists checkpoint 4, spec §3 "Row
// menu" and "Batch actions"): the "More actions" menu of a row with the read view's
// actions, Void and Delete draft from it with a server refusal in the list's banner, a
// navigating action and its back link, the tick boxes and tick-all, the Batch actions
// confirm dialog with its counts, the one-at-a-time result with the refused documents kept
// ticked, the selection kept by a sort and cleared by a chip, and the phone's icon button
// with Select all. Every test creates its own customer and documents, dated today, and
// finds its rows through the customer picker.
//
// Not covered by e2e (accepted, plan checkpoint 2):
// - the 50-row window growing: it needs 50+ documents and the screen's 12 tests are used;
//   the `mergeTransactions` and `documentListWindow` unit tests cover it, and
//   tests/e2e/list-paging.spec.ts is where a seeded case can go;
// - an inactive customer in the customer picker (the e2e uses a sub-customer);
// - the reader on a phone (gate 2, `read-only-phone-*`);
// - Download PDF from a row menu (the download leaves the page; the item's presence is
//   asserted);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const INVOICES_RECORDS = '**/api/collections/books_invoices/records'
const ENTRY_URL = /\/books\/entries\/[a-z0-9]{15}$/

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^sales-row-[a-z0-9]{15}$/).filter({ visible: true })
}

// Answers the `method` write of one invoice with a 400 that carries `message`; every
// other request passes. The wait comes back inside an object, so awaiting the call only
// installs the route; the test awaits `response` after the press that sends the write.
async function refuseInvoiceWrite(
    page: Page,
    id: string,
    method: 'PATCH' | 'DELETE',
    message: string
) {
    await page.route(`${INVOICES_RECORDS}/${id}*`, route =>
        route.request().method() === method
            ? route.fulfill({
                  status: 400,
                  contentType: 'application/json',
                  body: JSON.stringify({ status: 400, message, data: {} }),
              })
            : route.fallback()
    )
    return {
        response: page.waitForResponse(
            r =>
                r.request().method() === method &&
                r.url().includes(`/api/collections/books_invoices/records/${id}`) &&
                r.status() === 400
        ),
    }
}

// A customer with posted invoices (150.00 each, due today) and drafts, each draft with a
// unique memo, all dated today.
async function customerWithDocuments(page: Page, input: { posted: number; drafts: number }) {
    const today = await localToday(page)
    const made = await customerWithInvoices(
        page,
        Array.from({ length: input.posted }, () => ({ rate: '150.00', dueDate: today }))
    )
    const drafts: string[] = []
    for (let n = 0; n < input.drafts; n += 1) {
        drafts.push(await draftInvoiceFor(page, made.name, uniqueMemo(`Batch draft ${n}`)))
    }
    return {
        customer: { name: made.name, id: made.customerId },
        posted: made.invoices.map(invoice => invoice.id),
        drafts,
    }
}

function tick(page: Page, id: string) {
    return visible(page, `sales-tick-${id}`)
}

test.describe('sales-lists: row menu and batch', () => {
    test('desktop: the row menu voids, deletes a draft and opens the journal entry, with a refusal in the banner', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { customer, posted, drafts } = await customerWithDocuments(page, {
            posted: 1,
            drafts: 1,
        })
        const [invoice] = posted
        const [draft] = drafts
        if (invoice === undefined || draft === undefined) throw new Error('documents not made')

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await pickSalesCustomer(page, customer)
        await expect(listRows(page)).toHaveCount(2)
        await expect(visible(page, `sales-status-${invoice}`)).toHaveText('Open')

        // The menu press leaves the list on screen; the posted invoice's actions, in the
        // read view's order, with no Edit.
        await openRowMenu(page, invoice)
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expect
            .poll(() => rowMenuActions(page))
            .toEqual([
                'open',
                'send',
                'receive-payment',
                'write-off',
                'void',
                'copy',
                'credit-memo',
                'entry',
                'pdf',
            ])
        await expect(visible(page, 'sales-row-action-credit-memo')).toContainText(
            'Create credit memo'
        )
        await expect(visible(page, 'sales-row-action-entry')).toContainText('View journal entry')

        // Void opens its dialog over the list; the server's refusal shows in the banner.
        await visible(page, 'sales-row-action-void').click()
        await expect(visible(page, 'void-dialog')).toBeVisible()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        const refusal = 'The period is closed.'
        const refused = await refuseInvoiceWrite(page, invoice, 'PATCH', refusal)
        await visible(page, 'void-confirm').click()
        await refused.response
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(visible(page, 'sales-banner')).toContainText(refusal)
        await expect(visible(page, `sales-status-${invoice}`)).toHaveText('Open')

        // Void again with the route gone: the badge turns to Void.
        await page.unrouteAll({ behavior: 'wait' })
        await openRowMenu(page, invoice)
        await visible(page, 'sales-row-action-void').click()
        await visible(page, 'void-confirm').click()
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await expect(visible(page, `sales-status-${invoice}`)).toHaveText('Void')

        // The draft's menu holds Open and Delete draft; Delete draft removes the row.
        await openRowMenu(page, draft)
        await expect.poll(() => rowMenuActions(page)).toEqual(['open', 'delete-draft'])
        await visible(page, 'sales-row-action-delete-draft').click()
        await expect(visible(page, 'sales-delete-dialog')).toBeVisible()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await visible(page, 'sales-delete-confirm').click()
        await expect(page.getByTestId('sales-delete-dialog')).toHaveCount(0)
        await expect(salesRow(page, draft)).toHaveCount(0)
        await expect(listRows(page)).toHaveCount(1)

        // View journal entry on the void invoice opens its entry; the back link names the
        // list and returns to it.
        await openRowMenu(page, invoice)
        await expect.poll(() => rowMenuActions(page)).toEqual(['open', 'copy', 'entry', 'pdf'])
        await visible(page, 'sales-row-action-entry').click()
        await expect(page).toHaveURL(ENTRY_URL)
        const back = visible(page, 'entry-back')
        await expect(back.getByText('Invoices', { exact: true })).toBeVisible()
        await back.click()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expect(salesRow(page, invoice)).toBeVisible()
    })

    test('desktop: Delete drafts writes one at a time, keeps the refused ticked, and a chip clears the ticks', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { customer, posted, drafts } = await customerWithDocuments(page, {
            posted: 1,
            drafts: 2,
        })
        const [invoice] = posted
        const [refusedDraft, deletedDraft] = drafts
        if (invoice === undefined || refusedDraft === undefined || deletedDraft === undefined) {
            throw new Error('documents not made')
        }

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await pickSalesCustomer(page, customer)
        await expect(listRows(page)).toHaveCount(3)

        // Nothing ticked: Batch actions is disabled. Tick-all ticks the three rows.
        await expect(visible(page, 'sales-batch-actions')).toBeDisabled()
        await visible(page, 'sales-tick-all').click()
        for (const id of [invoice, refusedDraft, deletedDraft]) {
            await expect(tick(page, id)).toHaveAttribute('aria-checked', 'true')
        }
        await expect(visible(page, 'sales-tick-all')).toHaveAttribute('aria-checked', 'true')
        await expect(visible(page, 'sales-batch-actions')).toBeEnabled()

        // Delete drafts names what it applies to and what it skips.
        await visible(page, 'sales-batch-actions').click()
        await visible(page, 'sales-batch-delete-drafts').click()
        const dialog = visible(page, 'sales-batch-dialog')
        await expect(dialog).toContainText('Delete 2 drafts?')
        await expect(dialog).toContainText('1 selected document is not a draft and stays.')

        // The server refuses one draft: one done, one refused with its text.
        const refusal = 'This draft cannot be deleted right now.'
        const refused = await refuseInvoiceWrite(page, refusedDraft, 'DELETE', refusal)
        await visible(page, 'sales-batch-confirm').click()
        await refused.response
        await expect(page.getByTestId('sales-batch-dialog')).toHaveCount(0)
        await expect(visible(page, 'sales-banner')).toContainText(`1 done, 1 refused: ${refusal}`)
        await expect(salesRow(page, deletedDraft)).toHaveCount(0)
        await expect(salesRow(page, refusedDraft)).toBeVisible()
        await expect(tick(page, refusedDraft)).toHaveAttribute('aria-checked', 'true')
        await expect(tick(page, invoice)).toHaveAttribute('aria-checked', 'true')
        await page.unrouteAll({ behavior: 'wait' })

        // A sort keeps the ticks.
        const date = visible(page, 'sales-header-date')
        await date.click()
        await expect(date).toHaveAttribute('aria-sort', 'ascending')
        await expect(tick(page, refusedDraft)).toHaveAttribute('aria-checked', 'true')
        await expect(tick(page, invoice)).toHaveAttribute('aria-checked', 'true')

        // A chip clears them.
        await visible(page, 'sales-chip-draft').click()
        await expect(visible(page, 'sales-chip-draft')).toHaveAttribute('aria-pressed', 'true')
        await expect(salesRow(page, invoice)).toHaveCount(0)
        await expect(tick(page, refusedDraft)).toHaveAttribute('aria-checked', 'false')
        await expect(visible(page, 'sales-tick-all')).toHaveAttribute('aria-checked', 'false')
        await expect(visible(page, 'sales-batch-actions')).toBeDisabled()

        // Back to All: the cleared ticks do not come back.
        await visible(page, 'sales-chip-all').click()
        await expect(visible(page, 'sales-chip-all')).toHaveAttribute('aria-pressed', 'true')
        await expect(salesRow(page, invoice)).toBeVisible()
        await expect(tick(page, refusedDraft)).toHaveAttribute('aria-checked', 'false')
        await expect(tick(page, invoice)).toHaveAttribute('aria-checked', 'false')
        await expect(visible(page, 'sales-batch-actions')).toBeDisabled()
    })

    test('phone: the Batch actions icon selects all, voids both cards, and says when no draft applies', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const { customer, posted } = await customerWithDocuments(page, { posted: 2, drafts: 0 })
        const [first, second] = posted
        if (first === undefined || second === undefined) throw new Error('invoices not posted')

        await openSales(page)
        await openSalesTab(page, 'invoices')
        await page.setViewportSize(PHONE)
        await expect(visible(page, 'sales-cards')).toBeVisible()
        await pickSalesCustomer(page, customer)
        await expect(listRows(page)).toHaveCount(2)

        // The icon button is enabled with nothing ticked; its Delete drafts and Void are not.
        const batch = visible(page, 'sales-batch-actions')
        await expect(batch).toBeEnabled()
        await batch.click()
        await expect(visible(page, 'sales-batch-delete-drafts')).toHaveAttribute(
            'aria-disabled',
            'true'
        )
        await expect(visible(page, 'sales-batch-void')).toHaveAttribute('aria-disabled', 'true')

        // Select all ticks both cards.
        await visible(page, 'sales-batch-select-all').click()
        await expect(tick(page, first)).toHaveAttribute('aria-checked', 'true')
        await expect(tick(page, second)).toHaveAttribute('aria-checked', 'true')

        // Void applies to both; confirm voids them and the banner counts them.
        await batch.click()
        await visible(page, 'sales-batch-void').click()
        await expect(visible(page, 'sales-batch-dialog')).toContainText('Void 2 documents?')
        await visible(page, 'sales-batch-confirm').click()
        await expect(page.getByTestId('sales-batch-dialog')).toHaveCount(0)
        await expect(visible(page, `sales-status-${first}`)).toHaveText('Void')
        await expect(visible(page, `sales-status-${second}`)).toHaveText('Void')
        await expect(visible(page, 'sales-banner')).toContainText('2 done, 0 refused')
        await expect(tick(page, first)).toHaveAttribute('aria-checked', 'false')
        await expect(tick(page, second)).toHaveAttribute('aria-checked', 'false')

        // With both void cards ticked, Delete drafts applies to none: Close, no confirm.
        await tick(page, first).click()
        await tick(page, second).click()
        await expect(tick(page, first)).toHaveAttribute('aria-checked', 'true')
        await expect(tick(page, second)).toHaveAttribute('aria-checked', 'true')
        await batch.click()
        await visible(page, 'sales-batch-delete-drafts').click()
        await expect(visible(page, 'sales-batch-dialog')).toContainText('No drafts to delete')
        await expect(visible(page, 'sales-batch-close')).toBeVisible()
        await expect(page.getByTestId('sales-batch-confirm')).toHaveCount(0)
    })
})
