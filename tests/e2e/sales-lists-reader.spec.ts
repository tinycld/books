import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, signInAsCollaborator } from '@tinycld/core/e2e-helpers'
import { collaboratorLevel, type Level, setCollaboratorLevel } from './books-access-helpers'
import { createCustomer, uniqueName } from './customer-form-helpers'
import { sendDialog, toast } from './email-share-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    draftInvoiceFor,
    openRowMenu,
    openSales,
    pickSalesCustomer,
    postedInvoiceFor,
    rowMenuActions,
    salesRow,
} from './sales-lists-helpers'
import { uniqueEmail } from './statements-helpers'

// The Sales list for a reader (sales-lists checkpoint 4, spec §3 "Tabs and header", "Row
// menu" and "Batch actions"): a read-only collaborator sees no New button, no tick boxes
// and no Batch actions; a draft's row menu holds Open only, a posted invoice's Open, View
// journal entry and Download PDF; a row press opens the read view. The collaborator's level
// is one row of the shared e2e database, so this file's title ends in "(collaborator
// level)" and runs in the one-worker `books-access-level` project; the level is put back
// in afterEach (lesson 35).
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

const restore: { level: Level | undefined; closeReader: (() => Promise<void>) | undefined } = {
    level: undefined,
    closeReader: undefined,
}

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

test.describe('sales-lists: reader (collaborator level)', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test.afterEach(async ({ page }) => {
        const { level, closeReader } = restore
        restore.level = undefined
        restore.closeReader = undefined
        if (closeReader) await closeReader()
        if (level !== undefined) await setCollaboratorLevel(page, level)
    })

    test('a read-only collaborator gets no write control and read-only row menus', async ({
        page,
    }) => {
        // As the owner: a customer with a unique email, a draft and a posted invoice, and the
        // posted invoice sent from its row menu (email-share plan checkpoint 4).
        await login(page)
        await navigateToPackage(page, 'books')
        const name = uniqueName('Sales reader')
        const email = uniqueEmail('reader-send')
        await createCustomer(page, { name, email })
        const customerId = new URL(page.url()).pathname.split('/').pop() ?? ''
        const draft = await draftInvoiceFor(page, name, uniqueMemo('Reader draft'))
        const posted = await postedInvoiceFor(page, name, uniqueMemo('Reader posted'))
        await openSales(page)
        await pickSalesCustomer(page, { name, id: customerId })
        await openRowMenu(page, posted)
        await visible(page, 'sales-row-action-send').click()
        const dialog = sendDialog(page)
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('document-send-to')).toHaveValue(email)
        await dialog.getByTestId('document-send-submit').click()
        await expect(toast(page, `sent to ${email}`)).toBeVisible()
        await expect(sendDialog(page)).toHaveCount(0)

        restore.level = await collaboratorLevel(page)
        await setCollaboratorLevel(page, 'read_only')
        const reader = await signInAsCollaborator(page)
        restore.closeReader = reader.close
        const view = reader.page
        await view.setViewportSize({ width: 1280, height: 800 })

        await navigateToPackage(view, 'books')
        await openSales(view)
        await pickSalesCustomer(view, { name, id: customerId })
        await expect(salesRow(view, draft)).toBeVisible()
        await expect(salesRow(view, posted)).toBeVisible()

        // No New, no tick boxes, no Batch actions.
        await expect(view.getByTestId('sales-new')).toHaveCount(0)
        await expect(view.getByTestId('sales-tick-all')).toHaveCount(0)
        await expect(view.getByTestId(`sales-tick-${draft}`)).toHaveCount(0)
        await expect(view.getByTestId(`sales-tick-${posted}`)).toHaveCount(0)
        await expect(view.getByTestId('sales-batch-actions')).toHaveCount(0)
        await expect(view.getByTestId('sales-batch-send')).toHaveCount(0)

        // The draft's menu holds Open only.
        await openRowMenu(view, draft)
        await expect.poll(() => rowMenuActions(view)).toEqual(['open'])
        await view.keyboard.press('Escape')
        await expect(view.getByTestId('sales-row-action-open')).toHaveCount(0)

        // The posted invoice's holds Open, View journal entry and Download PDF.
        await openRowMenu(view, posted)
        await expect.poll(() => rowMenuActions(view)).toEqual(['open', 'entry', 'pdf'])
        await expect(view.getByTestId('sales-row-action-send')).toHaveCount(0)
        await view.keyboard.press('Escape')
        await expect(view.getByTestId('sales-row-action-open')).toHaveCount(0)

        // A row press opens the read view.
        await salesRow(view, posted).click()
        await expect(view).toHaveURL(new RegExp(`/books/invoices/${posted}$`))
        await expect(visible(view, 'invoice-read-only')).toBeVisible()

        // The reader sees the sent line and no Send… or Copy customer link (email-share
        // spec §3.1, §3.6, §3.7).
        await expect(visible(view, 'invoice-sent-line')).toContainText(`to ${email}`)
        await expect(view.getByTestId('invoice-read-send')).toHaveCount(0)
        await expect(view.getByTestId('invoice-read-link')).toHaveCount(0)
    })
})
