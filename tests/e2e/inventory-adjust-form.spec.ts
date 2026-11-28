import { expect, type Page, type Request, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    BIN_IDS,
    BINS,
    INVENTORY_ITEM_IDS,
    INVENTORY_TEXTS,
    inventoryItem,
} from '../../tinycld/books/lib/inventory-adjust-fixture'
import { PHONE } from './account-register-helpers'
import { openBooks } from './bank-deposit-helpers'
import {
    ADJUSTMENT_URL,
    ADJUSTMENTS_URL,
    adjustmentEntries,
    adjustmentLineCell,
    adjustmentLineCount,
    adjustmentMenuOption,
    listSettled,
    makeInventoryItem,
    NEW_ADJUSTMENT_URL,
    openNewAdjustment,
    pickAdjustmentItem as pickItem,
    postAdjustment,
    searchAdjustments,
    shown,
    uniqueMemo,
} from './inventory-adjust-helpers'
import { tabTo } from './keyboard-helpers'
import { uniqueName } from './products-services-helpers'

// The inventory adjustment form (inventory-adjust spec §3.2 to §3.4), checkpoint 4: a new
// adjustment made and posted from the keyboard only, a draft saved, reopened from the list
// and edited from the keyboard only, the form's rules and a refused post that keeps the
// form, and the phone's cards and bar.
//
// Each test first makes its own Inventory item through the product form (opening quantity
// 10, opening value $50.00, dated today, so its one FIFO layer costs $5.00 a unit) and
// adjusts only that item, so no seeded quantity changes. The phone test also opens a form
// for the seeded labels item and leaves it with nothing saved; it uses the seeded active
// bin Front counter as a picker value only. Every adjustment a test makes is dated today
// (after the close date books-settings.spec.ts holds) and found again by its per-run memo;
// its number is read from its title.
//
// Keyboard tests: after the form opens there is no click. The list screen around a reopen
// (its search and its row press) is not the form and is driven by the mouse.
//
// Not covered here: the no-access notice (no in-app link leads to `/new` for a reader;
// tests/adjustment-screen-state.test.ts), writes unavailable (unit cases of
// adjustmentFormKeysOffered), the 500-line limit (tests/adjustment-schema.test.ts), the
// average-cost book (the shared book is FIFO), Delete draft, `?copy` and `?replaces`
// (checkpoint 5), and native-only behavior.

const MINUS = '−'
const OPENING = { quantity: '10', value: '50.00' }
const LABELS = inventoryItem(INVENTORY_ITEM_IDS.labels).name
const INCREASE_BELOW_ZERO = 'A quantity increase cannot have a value below 0.'
const ADJUSTMENT_RECORD = '**/api/collections/books_inventory_adjustments/records/*'
// The Item picker of a line (spec §3.3 "Item: a picker of active Inventory items"; the
// reference's texts).
const ITEM_PLACEHOLDER = 'Choose an item'

function binName(id: string): string {
    const bin = BINS.find(row => row.id === id)
    if (!bin) throw new Error(`no fixture bin ${id}`)
    return bin.name
}

function isStatusPost(request: Request) {
    if (request.method() !== 'PATCH') return false
    const body: { status?: string } | null = request.postDataJSON()
    return body?.status === 'posted'
}

function form(page: Page) {
    return shown(page, 'inventory-adjustment-form')
}

function readView(page: Page) {
    return shown(page, 'inventory-adjustment-read')
}

// The read view's lines, in screen order.
function readLines(page: Page) {
    return readView(page).locator('[data-testid^="adjustment-read-line-"]')
}

// The line's Item picker holds the focus: typing opens its search with the text, and
// Enter picks the first match.
async function pickItemByTyping(page: Page, index: number, name: string) {
    await expect(adjustmentLineCell(page, index, 'item')).toBeFocused()
    await page.keyboard.type(name)
    await expect(adjustmentMenuOption(page, name)).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(adjustmentLineCell(page, index, 'item')).toContainText(name)
}

// The list, searched by the memo, with its one row pressed: the adjustment opens.
async function openFromList(page: Page, memo: string) {
    await expect(page).toHaveURL(ADJUSTMENTS_URL)
    await searchAdjustments(page, memo)
    await expect(adjustmentEntries(page)).toHaveCount(1)
    await adjustmentEntries(page).click()
    await expect(page).toHaveURL(ADJUSTMENT_URL)
}

test.describe('inventory-adjust: form', () => {
    test('a writer makes and posts an adjustment from the keyboard only', async ({ page }) => {
        const item = uniqueName('Adjust keyboard item')
        const memo = uniqueMemo('Adjust keyboard create')
        await openBooks(page)
        await makeInventoryItem(page, { name: item, ...OPENING })

        // The only mouse steps: the New menu and its Inventory adjustment item.
        await openNewAdjustment(page)
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            'New inventory adjustment'
        )
        // A new adjustment has no status yet: no badge.
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveCount(0)
        const date = shown(page, 'adjustment-date')
        await expect(date).toBeFocused()
        await expect.poll(() => adjustmentLineCount(page)).toBe(2)

        // Date → (its calendar button) → Adjustment account → Memo → line 1 Item.
        const account = shown(page, 'adjustment-account')
        await tabTo(page, account, { max: 2 })
        await expect(account).toContainText('Inventory shrinkage')
        const memoInput = shown(page, 'adjustment-memo')
        await tabTo(page, memoInput, { max: 1 })
        await page.keyboard.type(memo)
        await tabTo(page, adjustmentLineCell(page, 0, 'item'), { max: 1 })
        await pickItemByTyping(page, 0, item)
        await expect(adjustmentLineCell(page, 0, 'on-hand')).toHaveText('10')

        // New quantity 7: Change is −3, and a decrease takes its value at cost.
        const newQuantity = adjustmentLineCell(page, 0, 'new')
        await tabTo(page, newQuantity, { max: 3 })
        await page.keyboard.type('7')
        const change = adjustmentLineCell(page, 0, 'change')
        await expect(change).toHaveValue(/^[-−]3$/)
        const value = adjustmentLineCell(page, 0, 'value')
        await expect(value).toHaveValue(INVENTORY_TEXTS.atCost)
        await expect(value).not.toBeEditable()

        // Enter in Change, Value change being disabled: line 1 is not the last line, so no
        // line is added (the count below is 3 only if this Enter added none).
        await tabTo(page, change, { max: 1 })
        await page.keyboard.press('Enter')
        await expect.poll(() => adjustmentLineCount(page)).toBe(2)

        // Line 2: the same item, a revaluation of +5.00; Enter in the last line's Value
        // change adds line 3 and moves to its Item.
        await tabTo(page, adjustmentLineCell(page, 1, 'item'), { max: 4 })
        await pickItemByTyping(page, 1, item)
        await tabTo(page, adjustmentLineCell(page, 1, 'change'), { max: 3 })
        await page.keyboard.type('0')
        await tabTo(page, adjustmentLineCell(page, 1, 'value'), { max: 1 })
        await page.keyboard.type('5.00')
        await page.keyboard.press('Enter')
        await expect.poll(() => adjustmentLineCount(page)).toBe(3)
        await expect(adjustmentLineCell(page, 2, 'item')).toBeFocused()

        // ⌘↵ posts; the blank line 3 is not stored.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            /^Inventory adjustment IA-\d+$/
        )
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
        await expect(shown(page, 'adjustment-read-memo')).toContainText(memo)
        await expect(shown(page, 'adjustment-read-account')).toContainText('Inventory shrinkage')
        await expect(readLines(page)).toHaveCount(2)
        // 3 at the FIFO cost of $5.00.
        await expect(readLines(page).nth(0)).toContainText(`${MINUS}3`)
        await expect(readLines(page).nth(0)).toContainText(`${MINUS}$15.00`)
        await expect(readLines(page).nth(1).getByText('$5.00', { exact: true })).toBeVisible()
        await expect(shown(page, 'adjustment-read-total')).toContainText(`${MINUS}$10.00`)
    })

    test('a writer reopens a saved draft and edits it from the keyboard only', async ({ page }) => {
        const item = uniqueName('Adjust draft item')
        const memo = uniqueMemo('Adjust keyboard draft')
        await openBooks(page)
        await makeInventoryItem(page, { name: item, ...OPENING })

        // Setup: a draft of one line, Change 2 at Value change 12.00, saved with ⌘S from
        // /new, which replaces the route with the draft's.
        await openNewAdjustment(page)
        await shown(page, 'adjustment-memo').fill(memo)
        await pickItem(page, 0, item)
        await adjustmentLineCell(page, 0, 'change').fill('2')
        await adjustmentLineCell(page, 0, 'value').fill('12.00')
        await page.keyboard.press('ControlOrMeta+s')
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(form(page)).toBeVisible()
        // A saved draft has no number yet: "Inventory adjustment" with the Draft badge.
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText('Inventory adjustment')
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Draft')
        await shown(page, 'inventory-adjustment-back').click()

        // The draft from the list: the Date has the focus before the first key.
        await openFromList(page, memo)
        await expect(form(page)).toBeVisible()
        const date = shown(page, 'adjustment-date')
        await expect(date).toBeFocused()
        // On hand 10 + the stored Change 2.
        const newQuantity = adjustmentLineCell(page, 0, 'new')
        await expect(newQuantity).toHaveValue(/^12(\.0+)?$/)
        await expect.poll(() => adjustmentLineCount(page)).toBe(1)

        // Change 4 gives New quantity 14.
        const change = adjustmentLineCell(page, 0, 'change')
        await tabTo(page, change, { max: 8 })
        await page.keyboard.type('4')
        await expect(newQuantity).toHaveValue(/^14(\.0+)?$/)

        // ⌥↵ adds a line with the focus on its Item; ⌘⌥⌫ removes the focused line again.
        await page.keyboard.press('Alt+Enter')
        await expect.poll(() => adjustmentLineCount(page)).toBe(2)
        await pickItemByTyping(page, 1, item)
        await tabTo(page, adjustmentLineCell(page, 1, 'change'), { max: 3 })
        await page.keyboard.type('-1')
        await page.keyboard.press('ControlOrMeta+Alt+Backspace')
        await expect.poll(() => adjustmentLineCount(page)).toBe(1)

        // ⌘S saves the draft's changed line; Esc (Cancel) leaves the saved form.
        const saved = page.waitForResponse(
            r =>
                r.url().includes('/api/collections/books_inventory_adjustment_lines/records/') &&
                r.request().method() === 'PATCH' &&
                r.ok()
        )
        await page.keyboard.press('ControlOrMeta+s')
        await saved
        await page.keyboard.press('Escape')

        // Reopened from the list: the saved Change 4, Value change 12.00, one line.
        await openFromList(page, memo)
        await expect(form(page)).toBeVisible()
        await expect(date).toBeFocused()
        await expect(change).toHaveValue('4')
        await expect(adjustmentLineCell(page, 0, 'value')).toHaveValue('12.00')
        await expect.poll(() => adjustmentLineCount(page)).toBe(1)

        // ⌘↵ posts it.
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
        await expect(readLines(page)).toHaveCount(1)
        await expect(readLines(page).nth(0).getByText('+4', { exact: true })).toBeVisible()
        await expect(readLines(page).nth(0)).toContainText('$12.00')
    })

    test('the form refuses what its rules refuse, keeps a refused post, and guards its edits', async ({
        page,
    }) => {
        const item = uniqueName('Adjust rules item')
        const memo = uniqueMemo('Adjust rules')
        await openBooks(page)
        await makeInventoryItem(page, { name: item, ...OPENING })
        await openNewAdjustment(page)

        // No line filled: the form's summary.
        const post = shown(page, 'inventory-adjustment-post')
        await post.click()
        await expect(shown(page, 'inventory-adjustment-error-summary')).toContainText(
            INVENTORY_TEXTS.noLines
        )

        // An item and nothing else: on the line. The Item picker names what it lists.
        const line = shown(page, 'inventory-adjustment-line-0')
        await expect(adjustmentLineCell(page, 0, 'item')).toContainText(ITEM_PLACEHOLDER)
        await pickItem(page, 0, item)
        await post.click()
        await expect(line).toContainText(INVENTORY_TEXTS.lineEmpty)

        // An increase: "Empty uses the last cost." only while Value change is empty, so not
        // under a typed 0.00.
        const change = adjustmentLineCell(page, 0, 'change')
        const value = adjustmentLineCell(page, 0, 'value')
        const lastCostHint = shown(page, 'inventory-adjustment-line-value-hint-0')
        await change.fill('5')
        await expect(lastCostHint).toHaveText(INVENTORY_TEXTS.lastCostHint)
        await value.fill('0.00')
        await expect(lastCostHint).toHaveCount(0)

        // An increase with a value below 0. The error stays while the value is still wrong,
        // after the pointer leaves the field and after a focus and a blur of it.
        await value.fill('-1')
        await post.click()
        await expect(line).toContainText(INCREASE_BELOW_ZERO)
        const title = shown(page, 'inventory-adjustment-title')
        await title.click()
        await expect(value).toHaveValue(/^[-−]1(\.00)?$/)
        await expect(line).toContainText(INCREASE_BELOW_ZERO)
        await value.click()
        await title.click()
        await expect(value).toHaveValue(/^[-−]1(\.00)?$/)
        await expect(line).toContainText(INCREASE_BELOW_ZERO)

        // Change −11 takes the item below zero: the hint, and no refusal.
        await change.fill('-11')
        await expect(adjustmentLineCell(page, 0, 'new')).toHaveValue(/^[-−]1(\.0+)?$/)
        await expect(line).toContainText(INVENTORY_TEXTS.belowZero)
        await expect(line).not.toContainText(INCREASE_BELOW_ZERO)
        await shown(page, 'adjustment-memo').fill(memo)

        // Line 2: free stock, 2 in at a typed Value change of 0.00 (not the last cost).
        await pickItem(page, 1, item)
        await adjustmentLineCell(page, 1, 'change').fill('2')
        await adjustmentLineCell(page, 1, 'value').fill('0.00')

        // The status update refused with a line text, held first: while the post writes,
        // the header's back link is off, as Cancel is.
        const refusal = `Line 1: ${INCREASE_BELOW_ZERO}`
        let releaseRefusal = () => {}
        const held = new Promise<void>(resolve => {
            releaseRefusal = resolve
        })
        await page.route(ADJUSTMENT_RECORD, async route => {
            if (!isStatusPost(route.request())) return route.fallback()
            await held
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ status: 400, message: refusal, data: {} }),
            })
        })
        const statusSent = page.waitForRequest(
            request =>
                isStatusPost(request) && request.url().includes('/books_inventory_adjustments/')
        )
        await post.click()
        await statusSent
        await expect(shown(page, 'inventory-adjustment-cancel')).toBeDisabled()
        await expect(shown(page, 'inventory-adjustment-back')).toHaveAttribute(
            'aria-disabled',
            'true'
        )
        releaseRefusal()

        // The refusal: the header and lines are stored, so the route is the draft's (Discard
        // cannot leave a draft the user never saw), and the form stays with its values and
        // shows the text on line 1.
        await expect(line).toContainText(refusal)
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(form(page)).toBeVisible()
        await expect(title).toHaveText('Inventory adjustment')
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Draft')
        await expect(change).toHaveValue(/^[-−]11$/)
        await expect(adjustmentLineCell(page, 1, 'value')).toHaveValue('0.00')
        await expect(shown(page, 'adjustment-memo')).toHaveValue(memo)
        await page.unrouteAll({ behavior: 'wait' })

        // Post & new: the post goes through, and a blank form opens with 2 empty lines and
        // the Date focused.
        const posted = page.waitForResponse(
            r =>
                isStatusPost(r.request()) &&
                r.url().includes('/books_inventory_adjustments/') &&
                r.ok()
        )
        await shown(page, 'inventory-adjustment-post-new').click()
        await posted
        await expect(page).toHaveURL(NEW_ADJUSTMENT_URL)
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            'New inventory adjustment'
        )
        await expect(shown(page, 'adjustment-date')).toBeFocused()
        await expect.poll(() => adjustmentLineCount(page)).toBe(2)
        await expect(adjustmentLineCell(page, 0, 'change')).toHaveValue('')
        await expect(shown(page, 'adjustment-memo')).toHaveValue('')

        // A word in Memo: Cancel asks first; Discard leaves to the list, which holds the
        // posted adjustment.
        await shown(page, 'adjustment-memo').fill('Recount')
        await shown(page, 'inventory-adjustment-cancel').click()
        const discard = page.getByTestId('discard-dialog')
        await expect(discard).toBeVisible()
        await expect(page).toHaveURL(NEW_ADJUSTMENT_URL)
        await page.getByTestId('discard-confirm').click()
        await expect(discard).toHaveCount(0)
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        await searchAdjustments(page, memo)
        await expect(adjustmentEntries(page)).toHaveCount(1)
        await expect(adjustmentEntries(page)).toContainText('Posted')

        // Its line 2 came in at the typed $0.00.
        await adjustmentEntries(page).click()
        await expect(readView(page)).toBeVisible()
        await expect(readLines(page)).toHaveCount(2)
        await expect(readLines(page).nth(1).getByText('+2', { exact: true })).toBeVisible()
        await expect(readLines(page).nth(1).getByText('$0.00', { exact: true })).toBeVisible()
    })

    test('on a phone the lines are cards, the bar moves its actions into More, and a pick keeps the default bin', async ({
        page,
    }) => {
        const item = uniqueName('Adjust phone item')
        await login(page)
        await navigateToPackage(page, 'books')
        await makeInventoryItem(page, { name: item, ...OPENING })
        await page.setViewportSize(PHONE)

        // New from the phone New sheet.
        await openNewAdjustment(page)
        await expect(shown(page, 'inventory-adjustment-lines-cards')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-lines-table')).toHaveCount(0)

        // New quantity and Change side by side, each at least 140 px wide.
        const newQuantity = adjustmentLineCell(page, 0, 'new')
        const change = adjustmentLineCell(page, 0, 'change')
        await expect
            .poll(async () => {
                const a = await newQuantity.boundingBox()
                const b = await change.boundingBox()
                if (!a || !b) return null
                return {
                    sameRow: Math.abs(a.y - b.y) < 2,
                    changeRight: b.x >= a.x + a.width,
                    wide: a.width >= 140 && b.width >= 140,
                }
            })
            .toEqual({ sameRow: true, changeRight: true, wide: true })

        // The phone bar: Cancel, Post and More; More holds Save draft and Post & new.
        await expect(shown(page, 'inventory-adjustment-cancel')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-post')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-save-draft')).toHaveCount(0)
        await expect(shown(page, 'inventory-adjustment-post-new')).toHaveCount(0)
        await shown(page, 'inventory-adjustment-more').click()
        await expect(shown(page, 'inventory-adjustment-save-draft')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-post-new')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(shown(page, 'inventory-adjustment-post-new')).toHaveCount(0)

        // The item, with the Bin picker disabled while Change is 0; Change 1 in Front
        // counter at 5.00.
        await pickItem(page, 0, item)
        const bin = adjustmentLineCell(page, 0, 'bin')
        await expect(bin).toHaveAttribute('aria-disabled', 'true')
        await change.fill('1')
        await expect(bin).not.toHaveAttribute('aria-disabled', 'true')
        const frontCounter = binName(BIN_IDS.frontCounter)
        await bin.click()
        await adjustmentMenuOption(page, frontCounter).click()
        await expect(bin).toContainText(frontCounter)
        await adjustmentLineCell(page, 0, 'value').fill('5.00')
        const number = await postAdjustment(page)
        expect(number).toMatch(/^IA-\d+$/)
        await expect(shown(page, 'inventory-adjustment-read-lines-cards')).toBeVisible()
        await expect(readLines(page)).toHaveCount(1)
        await expect(readLines(page).nth(0)).toContainText(frontCounter)

        // A new form for the seeded labels item: its default bin fills Bin while the picker
        // is disabled, and stays when a Change is typed.
        await shown(page, 'inventory-adjustment-back').click()
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        await listSettled(page)
        await openNewAdjustment(page)
        const writes: string[] = []
        page.on('request', request => {
            if (request.method() === 'GET') return
            if (request.url().includes('/api/collections/books_inventory_adjustment')) {
                writes.push(`${request.method()} ${request.url()}`)
            }
        })
        const aisle3 = binName(BIN_IDS.aisle3)
        await pickItem(page, 0, LABELS)
        await expect(bin).toContainText(aisle3)
        await expect(bin).toHaveAttribute('aria-disabled', 'true')
        await change.fill('1')
        await expect(bin).not.toHaveAttribute('aria-disabled', 'true')
        await expect(bin).toContainText(aisle3)

        // Cancel asks (the form is dirty); Discard leaves, and nothing was written.
        await shown(page, 'inventory-adjustment-cancel').click()
        await expect(page.getByTestId('discard-dialog')).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        expect(writes).toEqual([])
    })
})
