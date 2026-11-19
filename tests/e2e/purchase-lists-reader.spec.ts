import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, signInAsCollaborator } from '@tinycld/core/e2e-helpers'
import { collaboratorLevel, type Level, setCollaboratorLevel } from './books-access-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    openPurchaseRowMenu,
    openPurchases,
    openPurchaseTab,
    pickPurchaseVendor,
    purchaseRow,
    purchaseRowMenuActions,
    searchPurchases,
} from './purchase-lists-helpers'

// The purchase lists for a reader (purchase-lists checkpoint 4, spec §3 "Tabs and header",
// "Row menu", "Batch actions" and §4 "Access"): a read-only collaborator sees the rows and
// no New button, no tick boxes and no Batch actions; a posted document's row menu holds
// Open and View journal entry, a draft's Open only; a search that matches nothing shows the
// no-match state with no New button. The test only reads the seeded rows of Northwest Paper
// Co. (PURCHASE_LIST_SEED). The collaborator's level is one row of the shared e2e
// database, so the title ends in "(collaborator level)" and runs in the one-worker
// `books-access-level` project; the level is put back in afterEach.
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

const NW_PAPER = 'Northwest Paper Co.'
// The four seeded documents of Northwest Paper Co.: three drafts and the posted credit.
const DRAFT_BILL = 'plbill00000draf'
const DRAFT_CREDIT = 'plvc0000000draf'
const DRAFT_REFUND = 'plvr0000000draf'
const CREDIT_31 = 'plvc00000000031'
const NW_ROWS = [DRAFT_BILL, DRAFT_CREDIT, DRAFT_REFUND, CREDIT_31]

const restore: { level: Level | undefined; closeReader: (() => Promise<void>) | undefined } = {
    level: undefined,
    closeReader: undefined,
}

function listRows(page: Page) {
    return page.getByTestId(/^purchases-row-[a-z0-9]{15}$/).filter({ visible: true })
}

async function closeRowMenu(page: Page) {
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('purchases-row-action-open')).toHaveCount(0)
}

test.describe('purchase-lists: reader', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test.afterEach(async ({ page }) => {
        const { level, closeReader } = restore
        restore.level = undefined
        restore.closeReader = undefined
        if (closeReader) await closeReader()
        if (level !== undefined) await setCollaboratorLevel(page, level)
    })

    test('a reader sees the rows and no write control (collaborator level)', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        restore.level = await collaboratorLevel(page)
        await setCollaboratorLevel(page, 'read_only')
        const reader = await signInAsCollaborator(page)
        restore.closeReader = reader.close
        const view = reader.page
        await view.setViewportSize({ width: 1280, height: 800 })

        await navigateToPackage(view, 'books')
        await openPurchases(view)
        await pickPurchaseVendor(view, NW_PAPER)
        for (const id of NW_ROWS) await expect(purchaseRow(view, id)).toBeVisible()
        await expect(listRows(view)).toHaveCount(4)

        // No New, no tick boxes, no Batch actions.
        await expect(view.getByTestId('purchases-new')).toHaveCount(0)
        await expect(view.getByTestId('purchases-tick-all')).toHaveCount(0)
        for (const id of NW_ROWS) {
            await expect(view.getByTestId(`purchases-tick-${id}`)).toHaveCount(0)
        }
        await expect(view.getByTestId('purchases-batch-actions')).toHaveCount(0)

        // The posted credit's menu holds Open and View journal entry only.
        await openPurchaseRowMenu(view, CREDIT_31)
        await expect.poll(() => purchaseRowMenuActions(view)).toEqual(['open', 'entry'])
        await closeRowMenu(view)

        // The draft bill's holds Open only.
        await openPurchaseRowMenu(view, DRAFT_BILL)
        await expect.poll(() => purchaseRowMenuActions(view)).toEqual(['open'])
        await closeRowMenu(view)

        // On Bills, a search nothing matches: no-match, with no New button.
        await openPurchaseTab(view, 'bills')
        await searchPurchases(view, uniqueMemo('Nothing holds'))
        await expect(view.getByTestId('purchases-no-match').filter({ visible: true })).toBeVisible()
        await expect(view.getByTestId('purchases-empty-new')).toHaveCount(0)
    })
})
