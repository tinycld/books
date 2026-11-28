import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    BIN_IDS,
    BINS,
    INVENTORY_ITEM_IDS,
    inventoryItem,
    SEED_STOCK,
} from '../../tinycld/books/lib/inventory-adjust-fixture'
import { PRODUCT_IDS, PRODUCTS } from '../../tinycld/books/lib/products-services-fixture'
import { PHONE } from './account-register-helpers'
import {
    ADJUSTMENT_URL,
    adjustmentLineCell,
    adjustmentLineCount,
    itemPage,
    itemTab,
    makeInventoryItem,
    NEW_ADJUSTMENT_URL,
    openItem,
    openItemDetails,
    PRODUCT_URL,
    shown,
} from './inventory-adjust-helpers'
import {
    discardDialog,
    openProduct,
    panelPlacement,
    uniqueName,
    WIDE,
} from './products-services-helpers'

// The item page of an Inventory item (inventory-adjust spec §3.6): the record-width page,
// its header, the four figures, the Stock tab with the cost layers and the movements that
// open their transaction, the Details tab with Default bin (§3.7), and the keys ⌥1 ⌥3 and
// A. Other product types keep the 480 px panel.
//
// The first test only reads the seeded labels item (SEED_STOCK, INVENTORY_ITEMS[0]): its
// Adjust stock step opens the form and cancels it, so nothing is saved. The phone test makes
// its own item through the product form and writes only that item.
//
// Phone: the phone path draws other code (the 2 × 2 figures, StockMovementCard), so the
// second test runs at 390 × 844. Move stock and the Bins tab come with a later checkpoint.

const LABELS = inventoryItem(INVENTORY_ITEM_IDS.labels)
const LABELS_STOCK = SEED_STOCK[INVENTORY_ITEM_IDS.labels]
const MINUS = '−'
const DASH = '—'

function productName(id: string): string {
    const row = PRODUCTS.find(product => product.id === id)
    if (!row) throw new Error(`no fixture product ${id}`)
    return row.name
}

function binName(id: string): string {
    const bin = BINS.find(row => row.id === id)
    if (!bin) throw new Error(`no fixture bin ${id}`)
    return bin.name
}

// A seeded active Service product: it opens in the 480 px form panel.
const SERVICE = productName(PRODUCT_IDS.consultation)
const AISLE_3 = binName(BIN_IDS.aisle3)
const FRONT_COUNTER = binName(BIN_IDS.frontCounter)

// The rows (table) or cards of the shown movements, top to bottom, each as its texts in
// screen order, in one snapshot. `item-move-stock` (Move stock) starts with the same
// prefix, so the rows are read inside their container only.
function moveTexts(container: Locator): Promise<string[][]> {
    return container.locator('[data-testid^="item-move-"]').evaluateAll(nodes =>
        nodes
            .map(node => ({
                top: node.getBoundingClientRect().top,
                texts: Array.from(node.querySelectorAll('*'))
                    .filter(el => el.children.length === 0)
                    .map(el => (el.textContent ?? '').trim())
                    .filter(text => text !== ''),
            }))
            .sort((a, b) => a.top - b.top)
            .map(row => row.texts)
    )
}

// The texts of the shown cost layers section, in screen order.
function layerTexts(section: Locator): Promise<string[]> {
    return section.evaluate(root =>
        Array.from(root.querySelectorAll('*'))
            .filter(el => el.children.length === 0)
            .map(el => (el.textContent ?? '').trim())
            .filter(text => text !== '')
    )
}

// The open cost layers (rows of the table or cards), each as its texts in screen order.
// The containers `item-layers-rows` / `item-layers-cards` do not match `item-layer-`.
function layerRowTexts(section: Locator): Promise<string[][]> {
    return section.locator('[data-testid^="item-layer-"]').evaluateAll(nodes =>
        nodes.map(node =>
            Array.from(node.querySelectorAll('*'))
                .filter(el => el.children.length === 0)
                .map(el => (el.textContent ?? '').trim())
                .filter(text => text !== '')
        )
    )
}

// How far the cost layers section, or any element in it, reaches past the window's
// right edge (0 when all of it is inside), or null while it is not laid out.
function layersOverflow(section: Locator): Promise<number | null> {
    return section.evaluate(root => {
        const own = root.getBoundingClientRect()
        if (own.width === 0) return null
        const rights = [root, ...Array.from(root.querySelectorAll('*'))].map(
            el => el.getBoundingClientRect().right
        )
        return Math.max(0, Math.max(...rights) - document.documentElement.clientWidth)
    })
}

// Presses a movements chip and waits until it is on.
async function pressMoveChip(page: Page, label: string) {
    const chip = itemPage(page).getByRole('button', { name: label, exact: true })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
}

// The top of a figure's box, or null while it is not laid out.
async function topOf(page: Page, testId: string): Promise<number | null> {
    const box = await shown(page, testId).boundingBox()
    return box ? box.y : null
}

// A PATCH of a product that the server answered.
function productPatched(page: Page) {
    return page.waitForResponse(
        r =>
            r.request().method() === 'PATCH' &&
            /\/api\/collections\/books_products\/records\/[^/]+$/.test(new URL(r.url()).pathname)
    )
}

test.describe('inventory-adjust: item page', () => {
    test('a bookkeeper reads an Inventory item on its page and opens its stock moves', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        await page.setViewportSize(WIDE)

        // Every other product type keeps the 480 px form panel.
        await openProduct(page, SERVICE)
        await expect
            .poll(() => panelPlacement(page))
            .toEqual({ widthIs480: true, atContentRight: true, listToItsLeft: true })
        await expect(shown(page, 'item-page')).toHaveCount(0)

        // The Inventory item opens its page, wider than the panel.
        await openItem(page, LABELS.name)
        const item = itemPage(page)
        await expect.poll(async () => (await item.boundingBox())?.width ?? 0).toBeGreaterThan(480)
        await expect(page.getByTestId('product-panel').filter({ visible: true })).toHaveCount(0)
        await expect(item.getByText(`${LABELS.code} · Inventory`, { exact: true })).toBeVisible()
        expect(LABELS.code).toBe('SHIP-LBL')

        // The figures read the seeded stock: 36 at 414.00, nothing on a purchase order, and
        // the book is FIFO, so the fourth is the oldest open layer's unit cost.
        expect(LABELS_STOCK).toMatchObject({ quantity_on_hand: 36, stock_value: 41_400 })
        await expect(shown(page, 'item-figure-on-hand')).toHaveText('36')
        await expect(shown(page, 'item-figure-on-po')).toHaveText(DASH)
        await expect(shown(page, 'item-figure-stock-value')).toHaveText('$414.00')
        await expect(shown(page, 'item-figure-cost')).toHaveText('$11.50')
        await expect(item.getByText('Next cost (FIFO)', { exact: true })).toBeVisible()
        await expect(item.getByText('Average cost', { exact: true })).toHaveCount(0)
        await expect(item.getByText('Reorder point 10', { exact: true })).toBeVisible()

        // Cost layers starts closed; opened, it holds the one open layer: 36 left at 11.50.
        const layers = shown(page, 'item-cost-layers')
        const layersToggle = layers.getByRole('button', { name: /Cost layers/ })
        await expect(layersToggle).toHaveAttribute('aria-expanded', 'false')
        await expect(layers.getByText('$414.00', { exact: true })).toHaveCount(0)
        await layersToggle.click()
        await expect(layersToggle).toHaveAttribute('aria-expanded', 'true')
        // At this width the layers are a table with the spec's header, and exactly one row.
        const layerTable = layers.getByTestId('item-layers-rows')
        await expect(layerTable).toBeVisible()
        await expect(layers.getByTestId('item-layers-cards')).toHaveCount(0)
        await expect
            .poll(async () => (await layerRowTexts(layerTable)).map(row => row.slice(-3)))
            .toEqual([['36', '$11.50', '$414.00']])
        // The header renders with the rows. Soft, so the steps below still run on a miss.
        expect
            .soft((await layerTexts(layerTable)).slice(0, 4))
            .toEqual(['Received', 'Quantity left', 'Unit cost', 'Value'])

        // Movements, newest first: the posted adjustment's decrease in Aisle 3, then the
        // opening stock of 40.
        const table = shown(page, 'item-movements-table')
        await expect(table).toBeVisible()
        await expect(shown(page, 'item-movements-cards')).toHaveCount(0)
        const bothRows = {
            count: 2,
            first: [
                expect.stringMatching(/^Inventory adjustment \S+$/),
                AISLE_3,
                `${MINUS}4`,
                `${MINUS}$46.00`,
                '36',
            ],
            last: [
                'Opening stock',
                AISLE_3,
                expect.stringMatching(/^\+?40$/),
                expect.stringMatching(/^\+?\$460\.00$/),
                '40',
            ],
        }
        const summary = async () => {
            const rows = await moveTexts(table)
            return { count: rows.length, first: rows[0]?.slice(-5), last: rows.at(-1)?.slice(-5) }
        }
        await expect.poll(summary).toEqual(bothRows)

        // Receipts: the item has none, and the chip's query does not fail.
        await pressMoveChip(page, 'Receipts')
        await expect.poll(async () => (await moveTexts(table)).length).toBe(0)
        await expect(item.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
        await expect(item.getByText(/^Could not load/)).toHaveCount(0)
        // Adjustments keeps both: the adjustment and the opening stock.
        await pressMoveChip(page, 'Adjustments')
        await expect.poll(summary).toEqual(bothRows)

        // The chip outlives a switch to Details and back.
        await page.keyboard.press('Alt+3')
        await expect(itemTab(page, 'Details')).toHaveAttribute('aria-selected', 'true')
        await page.keyboard.press('Alt+1')
        await expect(itemTab(page, 'Stock')).toHaveAttribute('aria-selected', 'true')
        await expect(
            item.getByRole('button', { name: 'Adjustments', exact: true })
        ).toHaveAttribute('aria-pressed', 'true')
        await expect.poll(summary).toEqual(bothRows)

        // The first row opens its adjustment's read view; Back returns to the item page.
        const transaction = (await moveTexts(table))[0]?.at(-5) ?? ''
        expect(transaction).toMatch(/^Inventory adjustment \S+$/)
        await table.locator('[data-testid^="item-move-"]').first().click()
        await expect(page).toHaveURL(ADJUSTMENT_URL)
        await expect(shown(page, 'inventory-adjustment-read')).toBeVisible()
        await expect(shown(page, 'inventory-adjustment-title')).toHaveText(transaction)
        await page.goBack()
        await expect(page).toHaveURL(PRODUCT_URL)
        await expect(itemPage(page)).toBeVisible()
        await expect(shown(page, 'item-figure-on-hand')).toHaveText('36')

        // ⌥3: Details is the product form, with Default bin and no Quantity on hand row.
        await expect(itemTab(page, 'Stock')).toHaveAttribute('aria-selected', 'true')
        await page.keyboard.press('Alt+3')
        await expect(itemTab(page, 'Details')).toHaveAttribute('aria-selected', 'true')
        await expect(item.getByTestId('form-input-name')).toBeVisible()
        await expect(item.getByTestId('form-field-reorder_point')).toBeVisible()
        await expect(item.getByTestId('form-input-default_bin')).toContainText(AISLE_3)
        await expect(item.getByTestId('form-field-quantity_on_hand')).toHaveCount(0)

        // ⌥1, then A: a new adjustment with one line of the item. Cancel leaves it unsaved.
        const writes: string[] = []
        page.on('request', request => {
            const path = new URL(request.url()).pathname
            if (request.method() !== 'GET' && path.includes('/books_inventory_adjustment')) {
                writes.push(`${request.method()} ${path}`)
            }
        })
        await page.keyboard.press('Alt+1')
        await expect(itemTab(page, 'Stock')).toHaveAttribute('aria-selected', 'true')
        await page.keyboard.press('a')
        await expect(page).toHaveURL(NEW_ADJUSTMENT_URL)
        await expect(page).toHaveURL(/[?&]product=[^&#]+/)
        await expect(shown(page, 'inventory-adjustment-form')).toBeVisible()
        await expect.poll(() => adjustmentLineCount(page)).toBe(1)
        await expect(adjustmentLineCell(page, 0, 'item')).toContainText(LABELS.name)
        await shown(page, 'inventory-adjustment-cancel').click()
        await expect(page).toHaveURL(PRODUCT_URL)
        await expect(itemPage(page)).toBeVisible()
        expect(writes).toEqual([])
    })

    test('on a phone the figures are two by two, a move is a card, and Details keeps edits', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const name = uniqueName('E2E Item page')
        await makeInventoryItem(page, {
            name,
            quantity: '5',
            value: '25.00',
            bin: FRONT_COUNTER,
        })

        await page.setViewportSize(PHONE)
        await openItem(page, name)
        const item = itemPage(page)

        // Two figures a row: the second beside the first, the third below it.
        await expect
            .poll(async () => {
                const [first, second, third] = await Promise.all([
                    topOf(page, 'item-figure-on-hand'),
                    topOf(page, 'item-figure-on-po'),
                    topOf(page, 'item-figure-stock-value'),
                ])
                if (first === null || second === null || third === null) return null
                return {
                    secondBeside: Math.abs(second - first) <= 1,
                    thirdBelow: third > first + 1,
                }
            })
            .toEqual({ secondBeside: true, thirdBelow: true })

        // The opening stock is one card: the transaction and the quantity, "<date> · <bin>"
        // and the value, then the quantity after it.
        const cards = shown(page, 'item-movements-cards')
        await expect(cards).toBeVisible()
        await expect(shown(page, 'item-movements-table')).toHaveCount(0)
        await expect
            .poll(() => moveTexts(cards))
            .toEqual([
                [
                    'Opening stock',
                    expect.stringMatching(/^\+?5$/),
                    expect.stringMatching(new RegExp(`· ${FRONT_COUNTER}$`)),
                    expect.stringMatching(/^\+?\$25\.00$/),
                    'On hand 5',
                ],
            ])

        // Cost layers on a phone: the one opening layer (5 at 25.00 in all, so 5.00 each) is
        // a card, not a table, and no part of the section reaches past the window.
        const layers = shown(page, 'item-cost-layers')
        await layers.getByRole('button', { name: /Cost layers/ }).click()
        const layerCards = layers.getByTestId('item-layers-cards')
        await expect(layerCards).toBeVisible()
        await expect(layers.getByTestId('item-layers-rows')).toHaveCount(0)
        const layerCard = layerCards.locator('[data-testid^="item-layer-"]')
        await expect(layerCard).toHaveCount(1)
        await expect(layerCard).toContainText(/Quantity left\s*5(?!\d)/)
        await expect(layerCard).toContainText(/Unit cost\s*\$5\.00/)
        await expect(layerCard).toContainText(/Value\s*\$25\.00/)
        await expect.poll(() => layersOverflow(layers)).toBe(0)

        // Details: a reorder point of 5 makes the item low (5 on hand); 4 does not.
        await openItemDetails(page)
        const reorder = item.getByTestId('form-input-reorder_point')
        const lowBadge = shown(page, 'item-low-stock')
        await expect(lowBadge).toHaveCount(0)
        for (const [value, isLow] of [
            ['5', true],
            ['4', false],
        ] as const) {
            await reorder.fill(value)
            await reorder.press('Tab')
            const saved = productPatched(page)
            await item.getByTestId('product-save').click()
            expect((await saved).status()).toBe(200)
            if (isLow) await expect(lowBadge).toBeVisible()
            else await expect(lowBadge).toHaveCount(0)
            await expect(reorder).toHaveValue(value)
        }

        // A tab switch keeps a typed value; Back asks before it leaves the dirty form.
        await reorder.fill('7')
        await reorder.press('Tab')
        await itemTab(page, 'Stock').click()
        await expect(itemTab(page, 'Stock')).toHaveAttribute('aria-selected', 'true')
        await openItemDetails(page)
        await expect(reorder).toHaveValue('7')
        await item
            .getByRole('button', { name: 'Back to products and services', exact: true })
            .click()
        const discard = discardDialog(page)
        await expect(discard.title).toBeVisible()
        await expect(discard.message).toBeVisible()
        await expect(page).toHaveURL(PRODUCT_URL)
        await discard.discard.click()
        await expect(page).toHaveURL(/\/books\/products$/)
        await expect(shown(page, 'products-list')).toBeVisible()
    })
})
