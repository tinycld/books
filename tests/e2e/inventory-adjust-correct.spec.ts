import { expect, type Page, type Request, test } from '@playwright/test'
import {
    ADJUSTMENT_IDS,
    adjustmentOf,
    INVENTORY_ITEM_IDS,
    INVENTORY_TEXTS,
    inventoryItem,
} from '../../tinycld/books/lib/inventory-adjust-fixture'
import { openBooks } from './bank-deposit-helpers'
import {
    ADJUSTMENT_URL,
    ADJUSTMENTS_URL,
    adjustmentEntries,
    adjustmentEntry,
    adjustmentIdFromUrl,
    adjustmentLineCell,
    adjustmentNumberOf,
    adjustmentRow,
    listSettled,
    makeInventoryItem,
    NEW_ADJUSTMENT_URL,
    openNewAdjustment,
    pickAdjustmentItem,
    postAdjustment,
    pressStatusChip,
    searchAdjustments,
    shown,
    uniqueMemo,
} from './inventory-adjust-helpers'
import { localToday } from './invoice-helpers'
import { uniqueName } from './products-services-helpers'

// Void, Edit as a correction, Copy and Delete draft of an inventory adjustment
// (inventory-adjust spec §3.2 `?copy`, §3.4, §3.5), checkpoint 5.
//
// Each test first makes its own Inventory item through the product form (opening quantity
// 10, opening value $50.00, dated today, so its one FIFO layer costs $5.00 a unit) and
// adjusts only that item, so no seeded quantity changes. Every adjustment a test makes is
// dated today (after the close date books-settings.spec.ts holds) and found again by its
// per-run memo; its number is read from its title. The seeded opening adjustment of the
// labels item is only read.
//
// Not covered here: the stale-draft notice (it needs a second signed-in writer;
// tests/adjustment-actions.test.ts adjustmentStale and tests/adjustment-screen-state.test.ts
// hold the rule), a reader's actions and writes unavailable (unit cases of
// adjustmentReadActions and adjustmentRowMenuItems), the closed-period refusal itself (Go;
// the notice path is the forced refusal below), and native-only behavior.

const MINUS = '−'
const OPENING = { quantity: '10', value: '50.00' }
const ADJUSTMENT_RECORD = '**/api/collections/books_inventory_adjustments/records/*'
// The seeded labels item's opening adjustment, which Books made.
const OPENING_MEMO = adjustmentOf(ADJUSTMENT_IDS.opening).memo
const LABELS = inventoryItem(INVENTORY_ITEM_IDS.labels).name
// The open adjustment shows beside the list at 1360 and wider (ListDetailLayout); 1280 x 720
// is the config's Desktop Chrome window.
const WIDE = { width: 1440, height: 900 }
const DESKTOP = { width: 1280, height: 720 }
const STALE_ID = 'inventory-adjustment-stale'

// From now on, marks the page once the stale-draft notice is in the DOM, also for one frame.
function watchStaleNotice(page: Page) {
    return page.evaluate(staleId => {
        const seen = { stale: false }
        new MutationObserver(() => {
            if (document.querySelector(`[data-testid="${staleId}"]`)) seen.stale = true
        }).observe(document.body, { subtree: true, childList: true, attributes: true })
        Object.assign(window, { __adjustmentStaleSeen: seen })
    }, STALE_ID)
}

function staleNoticeSeen(page: Page): Promise<boolean> {
    return page.evaluate(
        () =>
            (window as unknown as { __adjustmentStaleSeen: { stale: boolean } })
                .__adjustmentStaleSeen.stale
    )
}

function isStatusWrite(request: Request, status: string) {
    if (request.method() !== 'PATCH') return false
    const body: { status?: string } | null = request.postDataJSON()
    return body?.status === status
}

function form(page: Page) {
    return shown(page, 'inventory-adjustment-form')
}

function readView(page: Page) {
    return shown(page, 'inventory-adjustment-read')
}

function readLines(page: Page) {
    return readView(page).locator('[data-testid^="adjustment-read-line-"]')
}

// Every write (no GET) to the adjustment collections from now on.
function recordWrites(page: Page): string[] {
    const writes: string[] = []
    page.on('request', request => {
        if (request.method() === 'GET') return
        if (request.url().includes('/api/collections/books_inventory_adjustment')) {
            writes.push(`${request.method()} ${request.url()}`)
        }
    })
    return writes
}

// The shown form: memo, line 1 of `item` with `change` (and `value` when given). Fills by
// the mouse; the keyboard flows are inventory-adjust-form.spec.ts's.
async function fillOneLine(
    page: Page,
    input: { memo: string; item: string; change: string; value?: string }
) {
    await shown(page, 'adjustment-memo').fill(input.memo)
    await pickAdjustmentItem(page, 0, input.item)
    await adjustmentLineCell(page, 0, 'change').fill(input.change)
    if (input.value !== undefined) await adjustmentLineCell(page, 0, 'value').fill(input.value)
}

// From the list: a new draft of one line, saved with ⌘S (which replaces `/new` with the
// draft's route). Returns its id; the page stays on the draft's form.
async function saveDraft(page: Page, memo: string, item: string): Promise<string> {
    await openNewAdjustment(page)
    await fillOneLine(page, { memo, item, change: '1', value: '5.00' })
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page).toHaveURL(ADJUSTMENT_URL)
    await expect(form(page)).toBeVisible()
    await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Draft')
    return adjustmentIdFromUrl(page)
}

// Back from a shown adjustment to the list, settled.
async function backToList(page: Page) {
    await shown(page, 'inventory-adjustment-back').click()
    await expect(page).toHaveURL(ADJUSTMENTS_URL)
    await listSettled(page)
}

test.describe('inventory-adjust: correct, copy, void', () => {
    test('a writer corrects a posted adjustment with E and copies the correction with C', async ({
        page,
    }) => {
        const item = uniqueName('Adjust correct item')
        const memo = uniqueMemo('Adjust correct')
        await openBooks(page)
        await makeInventoryItem(page, { name: item, ...OPENING })

        // Setup: a posted decrease of 2.
        await openNewAdjustment(page)
        await fillOneLine(page, { memo, item, change: '-2' })
        const firstNumber = await postAdjustment(page)
        const firstId = adjustmentIdFromUrl(page)

        // E: the correction form with the posted line; New quantity is the on hand before
        // the posted change (10) + its Change.
        await expect(shown(page, 'inventory-adjustment-read-edit')).toBeVisible()
        await page.keyboard.press('e')
        await expect(page).toHaveURL(
            new RegExp(`/inventory-adjustments/new\\?replaces=${firstId}$`)
        )
        await expect(form(page)).toBeVisible()
        await expect(adjustmentLineCell(page, 0, 'item')).toContainText(item)
        const change = adjustmentLineCell(page, 0, 'change')
        await expect(change).toHaveValue(/^[-−]2$/)
        await expect(adjustmentLineCell(page, 0, 'new')).toHaveValue(/^8(\.0+)?$/)
        await expect(shown(page, 'adjustment-memo')).toHaveValue(memo)

        // Change −3, ⌘↵ posts the correction: a new adjustment of a new number.
        await change.fill('-3')
        await expect(adjustmentLineCell(page, 0, 'new')).toHaveValue(/^7(\.0+)?$/)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(page).not.toHaveURL(new RegExp(`/${firstId}$`))
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
        const secondNumber = await adjustmentNumberOf(page)
        expect(secondNumber).not.toBe(firstNumber)
        const secondId = adjustmentIdFromUrl(page)
        await expect(readLines(page)).toHaveCount(1)
        await expect(readLines(page).nth(0).getByText(`${MINUS}3`, { exact: true })).toBeVisible()
        await expect(readLines(page).nth(0)).toContainText(`${MINUS}$15.00`)
        await expect(shown(page, 'adjustment-read-total')).toContainText(`${MINUS}$15.00`)

        // The first one, by the list's Void chip: void, and replaced by the correction.
        await backToList(page)
        await searchAdjustments(page, memo)
        await pressStatusChip(page, 'void')
        await expect(adjustmentEntries(page)).toHaveCount(1)
        await adjustmentEntry(page, firstId).click()
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            `Inventory adjustment ${firstNumber}`
        )
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Void')
        const replacedBy = readView(page).getByRole('link', {
            name: `Replaced by inventory adjustment ${secondNumber}`,
            exact: true,
        })
        await expect(replacedBy).toBeVisible()

        // The correction, by that link. C: a new form from it, dated today.
        await replacedBy.click()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            `Inventory adjustment ${secondNumber}`
        )
        await expect(shown(page, 'inventory-adjustment-read-copy')).toBeVisible()
        const writes = recordWrites(page)
        await page.keyboard.press('c')
        await expect(page).toHaveURL(new RegExp(`/inventory-adjustments/new\\?copy=${secondId}$`))
        await expect(form(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            'New inventory adjustment'
        )
        await expect(shown(page, 'adjustment-memo')).toHaveValue(memo)
        await expect(shown(page, 'adjustment-date')).toHaveValue(await localToday(page))
        await expect(adjustmentLineCell(page, 0, 'item')).toContainText(item)
        await expect(change).toHaveValue(/^[-−]3$/)
        // On hand 7 = 10 − 3: only the correction counts, its void original does not.
        await expect(adjustmentLineCell(page, 0, 'on-hand')).toHaveText('7')
        await expect(adjustmentLineCell(page, 0, 'new')).toHaveValue(/^4(\.0+)?$/)

        // Cancel leaves the untouched copy at once, and nothing was written.
        await shown(page, 'inventory-adjustment-cancel').click()
        await expect(page).not.toHaveURL(NEW_ADJUSTMENT_URL)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        expect(writes).toEqual([])

        // A new adjustment for the item: On hand 7 there too (10 − 3, the void original
        // does not count).
        await openNewAdjustment(page)
        await pickAdjustmentItem(page, 0, item)
        await expect(adjustmentLineCell(page, 0, 'on-hand')).toHaveText('7')
    })

    test('a writer voids a posted adjustment after a refusal, deletes two drafts, and gets no action on one Books made', async ({
        page,
    }) => {
        const item = uniqueName('Adjust void item')
        const memo = uniqueMemo('Adjust void')
        await openBooks(page)
        await makeInventoryItem(page, { name: item, ...OPENING })

        // Setup: a posted increase of 1 at $5.00.
        await openNewAdjustment(page)
        await fillOneLine(page, { memo, item, change: '1', value: '5.00' })
        const number = await postAdjustment(page)
        const id = adjustmentIdFromUrl(page)

        // V: the confirm. The update refused: the dialog closes, the read view's notice
        // shows the server's text, and the adjustment stays posted.
        await expect(shown(page, 'inventory-adjustment-read-void')).toBeVisible()
        await page.keyboard.press('v')
        const dialog = page.getByTestId('adjustment-void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(INVENTORY_TEXTS.voidBody(number))
        const refusal = INVENTORY_TEXTS.closedPeriod
        await page.route(ADJUSTMENT_RECORD, route => {
            if (!isStatusWrite(route.request(), 'void')) return route.fallback()
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: refusal, data: {} }),
            })
        })
        const refused = page.waitForResponse(
            r => isStatusWrite(r.request(), 'void') && r.status() === 400
        )
        await page.getByTestId('adjustment-void-confirm').click()
        await refused
        await expect(dialog).toHaveCount(0)
        await expect(readView(page)).toContainText(refusal)
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
        await page.unrouteAll({ behavior: 'wait' })

        // V again, confirmed: Void, the Voided by stamp, and no Edit or Void.
        await page.keyboard.press('v')
        await expect(dialog).toBeVisible()
        await page.getByTestId('adjustment-void-confirm').click()
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Void')
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            `Inventory adjustment ${number}`
        )
        await expect(page).toHaveURL(new RegExp(`/${id}$`))
        await expect(shown(page, 'adjustment-read-voided')).toContainText(/^Voided by \S/)
        await expect(shown(page, 'inventory-adjustment-read-edit')).toHaveCount(0)
        await expect(shown(page, 'inventory-adjustment-read-void')).toHaveCount(0)

        // A saved draft, open beside the list at 1440 with unsaved memo edits, deleted from
        // its row menu: the panel closes to the list, the deleted draft's edits are not
        // asked about (no Discard), and the stale notice (a draft another person deleted)
        // never shows.
        await backToList(page)
        const draftMemo = uniqueMemo('Adjust delete row')
        const draftId = await saveDraft(page, draftMemo, item)
        await backToList(page)
        await page.setViewportSize(WIDE)
        await expect(shown(page, 'inventory-adjustments')).toBeVisible()
        await searchAdjustments(page, draftMemo)
        await adjustmentEntry(page, draftId).click()
        await expect(page).toHaveURL(new RegExp(`/inventory-adjustments/${draftId}$`))
        await expect(form(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustments')).toBeVisible()
        await shown(page, 'adjustment-memo').fill(`${draftMemo} edited`)
        await expect(shown(page, 'adjustment-memo')).toHaveValue(`${draftMemo} edited`)
        await watchStaleNotice(page)
        await shown(page, `inventory-adjustment-menu-${draftId}`).click()
        await shown(page, 'inventory-adjustment-menu-delete').click()
        const deleteDialog = page.getByTestId('delete-draft-dialog')
        await expect(deleteDialog).toBeVisible()
        await expect(deleteDialog).toContainText(INVENTORY_TEXTS.deleteDraft)
        await page.getByTestId('delete-draft-confirm').click()
        await expect(deleteDialog).toHaveCount(0)
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        await expect(page.getByTestId('discard-dialog')).toHaveCount(0)
        await expect(shown(page, 'inventory-adjustment-form')).toHaveCount(0)
        await expect(adjustmentEntry(page, draftId)).toHaveCount(0)
        await expect(page.getByTestId(STALE_ID)).toHaveCount(0)
        expect(await staleNoticeSeen(page)).toBe(false)
        await page.setViewportSize(DESKTOP)
        // The search still holds the deleted draft's memo, so the list shows its no-match
        // state (no table) and no form.
        await expect(shown(page, 'inventory-adjustments-list')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-form')).toHaveCount(0)
        await expect(shown(page, 'inventory-adjustments-no-match')).toBeVisible()
        // Clear the search so the list shows its rows again for the next draft.
        await shown(page, 'inventory-adjustments-clear-search').click()
        await listSettled(page)
        await expect(shown(page, 'inventory-adjustments')).toBeVisible()

        // A second draft, deleted from its form with ⌘⌫ and the confirm: the list opens.
        const formMemo = uniqueMemo('Adjust delete form')
        // saveDraft waited for the saved draft's route and its Draft badge: ⌘⌫ is offered.
        await saveDraft(page, formMemo, item)
        await page.keyboard.press('ControlOrMeta+Backspace')
        await expect(deleteDialog).toBeVisible()
        await expect(deleteDialog).toContainText(INVENTORY_TEXTS.deleteDraft)
        await page.getByTestId('delete-draft-confirm').click()
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        await searchAdjustments(page, formMemo)
        await expect(adjustmentEntries(page)).toHaveCount(0)

        // The seeded opening adjustment (Made by Books): no Edit, Void or Copy, and E, V
        // and C do nothing.
        await searchAdjustments(page, OPENING_MEMO)
        const madeByBooks = shown(page, 'inventory-adjustments-made-by-books')
        await madeByBooks.click()
        await expect(madeByBooks).toHaveAttribute('aria-pressed', 'true')
        await listSettled(page)
        const openingRow = adjustmentRow(page, /^(\d+ )?Opening Balance Equity$/)
        await expect(openingRow.first()).toContainText(LABELS)
        await openingRow.first().click()
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'adjustment-books-made')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
        const openingUrl = page.url()
        await expect(shown(page, 'inventory-adjustment-read-edit')).toHaveCount(0)
        await expect(shown(page, 'inventory-adjustment-read-void')).toHaveCount(0)
        await expect(shown(page, 'inventory-adjustment-read-copy')).toHaveCount(0)
        // The keys reach this read view (no input or layer takes them): ⇧? opens core's list,
        // and it shows no group of the adjustment's keys; Escape closes only the list.
        await page.keyboard.press('Shift+?')
        const keyList = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' })
        await expect(keyList).toBeVisible()
        await expect(keyList.getByText('Inventory adjustment', { exact: true })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(keyList).toHaveCount(0)
        await expect(page).toHaveURL(openingUrl)
        for (const key of ['e', 'v', 'c']) await page.keyboard.press(key)
        await expect(page.getByTestId('adjustment-void-dialog')).toHaveCount(0)
        await expect(page).toHaveURL(openingUrl)
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
    })
})
