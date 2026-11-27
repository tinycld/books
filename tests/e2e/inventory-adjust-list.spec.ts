import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    ADJUSTMENT_IDS,
    adjustmentOf,
    BIN_IDS,
    BINS,
    INVENTORY_ITEM_IDS,
    inventoryItem,
    SEED_DRAFT_MEMO,
    SEED_POSTED_MEMO,
} from '../../tinycld/books/lib/inventory-adjust-fixture'
import { PHONE } from './account-register-helpers'
import { openBooks } from './bank-deposit-helpers'
import {
    ADJUSTMENT_URL,
    ADJUSTMENTS_URL,
    adjustmentEntries,
    adjustmentEntry,
    adjustmentEntryIds,
    adjustmentRow,
    listSettled,
    openInventoryTab,
    pressStatusChip,
    searchAdjustments,
    shown,
} from './inventory-adjust-helpers'

// The inventory adjustments list and read view (inventory-adjust spec §3.5, §2 Q2): the
// tab of Products and services, its search, chips and sort, the read view of the seeded
// posted adjustment (IA-5) and of the void one it replaced (IA-4), the entry link, and the
// phone cards with Books search. The seeded adjustments are only read: no test here writes
// one. Rows are found by fixture id and by memo words, so adjustments other specs make do
// not move what these tests read.

const LABELS = inventoryItem(INVENTORY_ITEM_IDS.labels).name
const SCANNER = inventoryItem(INVENTORY_ITEM_IDS.scanner).name
const POSTED = adjustmentOf(ADJUSTMENT_IDS.posted)
const ITEMS_TEXT = `${LABELS} + 1 more`
// ADJUSTMENTS posted.value_change 9_000.
const POSTED_VALUE = '$90.00'
const MINUS = '−'

// Words of SEED_POSTED_MEMO only: no other seeded adjustment has them.
const POSTED_WORDS = 'water damaged'
// A word both seeded manual memos hold ("Cycle count, aisle 3…", "November count, …"), and
// the void one's ("Cycle count, aisle 3").
const COUNT_WORD = 'count'
// The memo of the labels' opening adjustment, which Books made.
const OPENING_MEMO = adjustmentOf(ADJUSTMENT_IDS.opening).memo

function binName(id: string): string {
    const bin = BINS.find(row => row.id === id)
    if (!bin) throw new Error(`no fixture bin ${id}`)
    return bin.name
}

// The entry read view's account labels, in one snapshot.
function entryAccounts(page: Page) {
    return shown(page, 'entry-read-only').evaluate(root =>
        Array.from(root.querySelectorAll('[data-testid^="entry-line-account-"]')).map(node =>
            (node.textContent ?? '').trim()
        )
    )
}

function readView(page: Page) {
    return shown(page, 'inventory-adjustment-read')
}

// A read line, by its fixture line id (the read view's `…read-line-<id>`).
function readLine(page: Page, lineId: string) {
    return readView(page).locator(`[data-testid$="read-line-${lineId}"]`).filter({ visible: true })
}

test.describe('inventory-adjust: list and read view', () => {
    test('a bookkeeper finds, filters and sorts adjustments and reads the posted and the void one', async ({
        page,
    }) => {
        expect(SEED_POSTED_MEMO).toContain(POSTED_WORDS)
        expect(SEED_DRAFT_MEMO).toContain(COUNT_WORD)
        await openBooks(page)
        await openInventoryTab(page, 'Inventory adjustments')
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        await expect(shown(page, 'inventory-adjustments')).toBeVisible()
        // The tab has no sidebar entry of its own: Lists stays the active one.
        await expect(shown(page, 'books-nav-lists')).toHaveAttribute('aria-current', 'page')

        // The memo's words find the posted adjustment alone.
        await searchAdjustments(page, POSTED_WORDS)
        const postedRow = adjustmentEntry(page, ADJUSTMENT_IDS.posted)
        await expect(adjustmentEntries(page)).toHaveCount(1)
        await expect(postedRow).toContainText(ITEMS_TEXT)
        await expect(postedRow).toContainText(POSTED_VALUE)
        await expect(postedRow).toContainText('Posted')

        // The chips filter in the query: Draft shows the draft and not the posted one,
        // Void the replaced one.
        await searchAdjustments(page, COUNT_WORD)
        await expect(postedRow).toBeVisible()
        await pressStatusChip(page, 'draft')
        await expect(adjustmentEntry(page, ADJUSTMENT_IDS.draft)).toBeVisible()
        await expect(postedRow).toHaveCount(0)
        await pressStatusChip(page, 'void')
        await expect(adjustmentEntry(page, ADJUSTMENT_IDS.replaced)).toBeVisible()
        await expect(postedRow).toHaveCount(0)
        await expect(adjustmentEntry(page, ADJUSTMENT_IDS.draft)).toHaveCount(0)
        await pressStatusChip(page, 'all')

        // Made by Books adds the opening adjustments, absent before the press.
        await searchAdjustments(page, OPENING_MEMO)
        // The Account cell: the account's label, "<number> <name>" or the name alone.
        const openingRow = adjustmentRow(page, /^(\d+ )?Opening Balance Equity$/)
        await expect(openingRow).toHaveCount(0)
        const madeByBooks = shown(page, 'inventory-adjustments-made-by-books')
        await madeByBooks.click()
        await expect(madeByBooks).toHaveAttribute('aria-pressed', 'true')
        await listSettled(page)
        await expect(openingRow.first()).toBeVisible()
        await expect(openingRow.first()).toContainText(LABELS)
        await madeByBooks.click()
        await expect(madeByBooks).toHaveAttribute('aria-pressed', 'false')

        // The header Value change sorts: the first row changes.
        await searchAdjustments(page, COUNT_WORD)
        await expect(postedRow).toBeVisible()
        const before = await adjustmentEntryIds(page)
        expect(before.length).toBeGreaterThan(1)
        await page
            .getByRole('button', { name: /^(Sort by Value change|Value change, sorted)/ })
            .filter({ visible: true })
            .click()
        await listSettled(page)
        await expect.poll(async () => (await adjustmentEntryIds(page))[0]).not.toBe(before[0])

        // The posted one: each line's Value change is the value Books posted for the line
        // (its posted_value), the total is the adjustment's value_change.
        await postedRow.click()
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(readView(page)).toBeVisible()
        const decrease = readLine(page, 'ialnposted00001')
        await expect(decrease).toContainText(LABELS)
        await expect(decrease).toContainText(binName(BIN_IDS.aisle3))
        await expect(decrease).toContainText(`${MINUS}4`)
        await expect(decrease).toContainText(`${MINUS}$46.00`)
        const increase = readLine(page, 'ialnposted00002')
        await expect(increase).toContainText(SCANNER)
        await expect(increase).toContainText(`${binName(BIN_IDS.backRoom)} (inactive)`)
        // The Change cell (quantityChangeText): an increase of 2.
        await expect(increase.getByText('+2', { exact: true })).toBeVisible()
        await expect(increase).toContainText('$136.00')
        await expect(readView(page)).toContainText('Total value change')
        await expect(shown(page, 'adjustment-read-total')).toContainText(POSTED_VALUE)
        await expect(readView(page).getByText(/^Posted by \S/)).toBeVisible()
        const postedTitle = shown(page, 'inventory-adjustment-title')
        await expect(postedTitle).toHaveText(/^Inventory adjustment IA-\d+$/)
        const postedNumber = (await postedTitle.innerText()).replace('Inventory adjustment ', '')
        expect(POSTED.memo).toBe(SEED_POSTED_MEMO)

        // View journal entry opens the adjustment's entry, which moves Inventory asset.
        await readView(page).getByRole('link', { name: 'View journal entry' }).click()
        await expect(page).toHaveURL(/\/books\/entries\/[^/?#]+$/)
        await expect(shown(page, 'entry-read-only')).toBeVisible()
        await expect
            .poll(async () => (await entryAccounts(page)).some(a => /Inventory asset$/.test(a)))
            .toBe(true)
        await shown(page, 'entry-back').click()
        await expect(readView(page)).toBeVisible()
        await expect(postedTitle).toHaveText(`Inventory adjustment ${postedNumber}`)

        // Back to the list; the void one shows Voided by and the link to its replacement.
        await shown(page, 'inventory-adjustment-back').click()
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        await listSettled(page)
        await adjustmentEntry(page, ADJUSTMENT_IDS.replaced).click()
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Void')
        await expect(readView(page).getByText(/^Voided by \S/)).toBeVisible()
        // The void took the line's stock moves away but keeps what Books posted: the line
        // shows its posted value, and the total, the stored value_change, is the same.
        const voidLine = readLine(page, 'ialnvoid0000001')
        await expect(voidLine).toContainText(LABELS)
        await expect(voidLine.getByText(`${MINUS}$34.50`, { exact: true })).toBeVisible()
        await expect(shown(page, 'adjustment-read-total')).toContainText(`${MINUS}$34.50`)
        const replacedBy = readView(page).getByRole('link', {
            name: `Replaced by inventory adjustment ${postedNumber}`,
            exact: true,
        })
        await replacedBy.click()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            `Inventory adjustment ${postedNumber}`
        )
        await expect(shown(page, 'inventory-adjustment-badge')).toHaveText('Posted')
    })

    test('on a phone the list and the read lines are cards, and Books search opens the adjustment', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(PHONE)
        await openInventoryTab(page, 'Inventory adjustments')
        await expect(shown(page, 'inventory-adjustments-cards')).toBeVisible()
        await expect(shown(page, 'inventory-adjustments-table')).toHaveCount(0)

        await searchAdjustments(page, POSTED_WORDS)
        const card = adjustmentEntry(page, ADJUSTMENT_IDS.posted)
        await expect(card).toContainText(ITEMS_TEXT)
        await expect(card).toContainText(POSTED_VALUE)
        await expect(card).toContainText(/IA-\d+ · \S/)
        await expect(card).toContainText('Posted')
        const cardNumber = /(IA-\d+) · /.exec(await card.innerText())?.[1]
        expect(cardNumber).toMatch(/^IA-\d+$/)

        await card.click()
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-read-lines-cards')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            `Inventory adjustment ${cardNumber}`
        )

        // Books search by the memo words: the hit is titled by the adjustment's number and
        // opens its read view.
        await shown(page, 'inventory-adjustment-back').click()
        await expect(page).toHaveURL(ADJUSTMENTS_URL)
        await page.keyboard.press('/')
        const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
        await expect(input).toBeFocused()
        const searched = page.waitForResponse(
            r =>
                r.url().includes('/api/search') &&
                r.status() === 200 &&
                new URL(r.url()).searchParams.get('q') === POSTED_WORDS
        )
        await page.keyboard.type(POSTED_WORDS)
        await searched
        await page
            .getByRole('option')
            .filter({ hasText: new RegExp(`^Inventory adjustment ${cardNumber}(?!\\d)`) })
            .click()
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(readView(page)).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(
            `Inventory adjustment ${cardNumber}`
        )
    })
})
