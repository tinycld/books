import { expect, type Page, test } from '@playwright/test'
import {
    BIN_IDS,
    INVENTORY_ITEM_IDS,
    INVENTORY_TEXTS,
    inventoryItem,
} from '~/tinycld/books/lib/inventory-adjust-fixture'
import { PRODUCT_IDS, PRODUCTS } from '~/tinycld/books/lib/products-services-fixture'
import { DESKTOP, PHONE } from './account-register-helpers'
import {
    type ReportSnapshot,
    reportSnapshot,
    reportSnapshotAtEnd,
    reportSnapshotAtTop,
    snapshotWhen,
} from './books-report-helpers'
import {
    binGroup,
    binGroupLabels,
    binItemCount,
    itemPage,
    lowStockChip,
    makeInventoryItem,
    openBins,
    openInventoryTab,
    openItem,
    openItemDetails,
    openStockByBinFromBins,
    openStockInBin,
    PRODUCT_URL,
    pickOnlyBin,
    productPatched,
    productTypeCell,
    quantityBelowLabel,
    reportSideScroll,
    setLowStockChip,
    shown,
    stockFigure,
} from './inventory-adjust-helpers'
import { productEntry, searchProducts, uniqueName } from './products-services-helpers'
import { openBooks } from './record-form-helpers'

// The Stock by Bin Location report and low stock in the Products and services list
// (inventory-adjust spec §3.9, §3.10, checkpoint 9). Both tests read the seeded stock
// (SEED_BIN_STOCK, SEED_STOCK, INVENTORY_ITEMS) and write none of it: other specs make their
// own items, some in Front counter, so a bin row's count is read and compared with the rows
// under it. The second test makes its own item for the low_stock write.
//
// Phone runs: the report's phone layout of 2 tracks (display.layouts, core's phone row) and
// the products list's ProductCard are other code than the desktop paths.

const LABELS = inventoryItem(INVENTORY_ITEM_IDS.labels)
const PAPER_ROLL = inventoryItem(INVENTORY_ITEM_IDS.paperRoll)
const LABELS_ROW = `${LABELS.code} · ${LABELS.name}`
const PAPER_ROLL_ROW = `${PAPER_ROLL.code} · ${PAPER_ROLL.name}`

const AISLE = 'Aisle 3, shelf B'
const FRONT_COUNTER = 'Front counter'
const BACK_ROOM = 'Back room (inactive)'
const NO_BIN = 'No bin'

// The narrowest phone of lesson 20, and the tablet width where the package sidebar is open
// beside the list (its pane is 768 - 64 rail - 175 sidebar = 529 px).
const NARROW_PHONE = { width: 375, height: 812 }
const TABLET = { width: 768, height: 1024 }
// Spec §3.10: the products table's own minimum width; below it the list shows cards.
const PRODUCT_TABLE_MIN = 604
// A window just above the panel's 1360 px minimum: with the 480 px panel open, the list's
// pane is below PRODUCT_TABLE_MIN.
const PANEL_CARDS = { width: 1366, height: 900 }
// Two active seeded Services that the search "setup" finds (products-services-fixture).
const PAYROLL_SETUP_ID = 'prodpayrollst01'
const WORKSTATION_SETUP_ID = 'prodwsimaging01'

// The width of the products list's pane.
async function productsPaneWidth(page: Page) {
    const box = await shown(page, 'products-list').boundingBox()
    return box?.width ?? 0
}

function serviceRow() {
    const row = PRODUCTS.find(product => product.id === PRODUCT_IDS.consultation)
    if (row?.type !== 'service') throw new Error('no seeded Service product')
    return row
}

// The item row labelled `label` under the bin row `bin`.
function itemIn(snapshot: ReportSnapshot, bin: string, label: string) {
    return binGroup(snapshot, bin)?.items.find(row => row.label === label)
}

test.describe('inventory-adjust: report and low stock', () => {
    test('the Stock by Bin Location report lists the stock of each bin, on desktop and on a phone', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        await openBins(page)
        await openStockByBinFromBins(page)

        // The first bins: Aisle 3, shelf B open with the labels, and Back room (inactive).
        const top = await snapshotWhen(
            page,
            reportSnapshotAtTop,
            s => itemIn(s, AISLE, LABELS_ROW) !== undefined && binGroup(s, BACK_ROOM) !== undefined,
            `${AISLE} with ${LABELS_ROW}, and ${BACK_ROOM}`
        )
        const labelsInAisle = itemIn(top, AISLE, LABELS_ROW)
        if (!labelsInAisle) throw new Error(`no ${LABELS_ROW} under ${AISLE}`)
        expect(stockFigure(labelsInAisle, 'quantity'), 'the labels in Aisle 3').toBe(32)
        expect(stockFigure(labelsInAisle, 'reorder_point'), 'the labels reorder point').toBe(10)
        const aisle = binGroup(top, AISLE)
        if (!aisle) throw new Error(`no ${AISLE} row`)
        expect(
            stockFigure(aisle.group, 'reorder_point'),
            'a bin row has no reorder point'
        ).toBeNull()

        // The last bin: No bin, and no Total row after it.
        const end = await snapshotWhen(
            page,
            reportSnapshotAtEnd,
            s => binGroup(s, NO_BIN) !== undefined,
            `the ${NO_BIN} row at the end of the report`
        )
        expect(binGroupLabels(end).at(-1), 'No bin is the last bin').toBe(NO_BIN)
        expect(
            [...top.rows, ...end.rows].filter(row => row.kind === 'total'),
            'no Total row'
        ).toEqual([])

        // Only Front counter: the other bins go.
        await pickOnlyBin(page, FRONT_COUNTER, BIN_IDS.frontCounter)
        const counter = await snapshotWhen(
            page,
            reportSnapshot,
            s => binGroupLabels(s).join('|') === FRONT_COUNTER,
            `only ${FRONT_COUNTER}`
        )
        const front = binGroup(counter, FRONT_COUNTER)
        if (!front) throw new Error(`no ${FRONT_COUNTER} row`)
        const labelsInFront = front.items.find(row => row.label === LABELS_ROW)
        const paperInFront = front.items.find(row => row.label === PAPER_ROLL_ROW)
        if (!labelsInFront || !paperInFront) {
            throw new Error(`${FRONT_COUNTER} holds ${front.items.map(row => row.label)}`)
        }
        expect(stockFigure(labelsInFront, 'quantity'), 'the labels in Front counter').toBe(4)
        expect(stockFigure(paperInFront, 'quantity'), 'the paper roll in Front counter').toBe(3)
        expect(stockFigure(paperInFront, 'reorder_point'), 'the paper roll reorder point').toBe(12)
        expect(binItemCount(front.group), 'the bin row counts its item rows').toBe(
            front.items.length
        )

        // An item row opens the item page.
        await page.getByTestId(`report-row-${labelsInFront.id}`).click()
        await expect(page).toHaveURL(PRODUCT_URL)
        await expect(itemPage(page)).toContainText(LABELS.name)

        // The row menu of Aisle 3, shelf B: the report with only that bin.
        await openBins(page)
        await openStockInBin(page, AISLE, BIN_IDS.aisle3)
        const onlyAisle = await snapshotWhen(
            page,
            reportSnapshot,
            s =>
                binGroupLabels(s).join('|') === AISLE && itemIn(s, AISLE, LABELS_ROW) !== undefined,
            `only ${AISLE}, from its row menu`
        )
        const labelsRow = itemIn(onlyAisle, AISLE, LABELS_ROW)
        if (!labelsRow) throw new Error(`no ${LABELS_ROW} under ${AISLE}`)

        // At 390 px: Quantity on the line below the label, and no sideways scroll.
        await page.setViewportSize(PHONE)
        await expect(page.getByTestId('report-table').filter({ visible: true })).toHaveAttribute(
            'data-layout',
            'mobile'
        )
        await expect
            .poll(() => quantityBelowLabel(page, labelsRow.id), {
                message: `the Quantity of ${LABELS_ROW} is below its label`,
            })
            .toBe(true)
        await expect
            .poll(() => reportSideScroll(page), { message: 'the report does not scroll sideways' })
            .toBe(0)

        // At 375 px too (lesson 20): the narrowest phone row still keeps both.
        await page.setViewportSize(NARROW_PHONE)
        await expect
            .poll(() => quantityBelowLabel(page, labelsRow.id), {
                message: `the Quantity of ${LABELS_ROW} is below its label at 375`,
            })
            .toBe(true)
        await expect
            .poll(() => reportSideScroll(page), {
                message: 'the report does not scroll sideways at 375',
            })
            .toBe(0)
    })

    test('the products list shows the stock and keeps the low items under Low stock, on desktop and on a phone', async ({
        page,
    }) => {
        const service = serviceRow()
        await openBooks(page, DESKTOP)
        await openInventoryTab(page, 'Products and services')

        // The Type cell's second line.
        await searchProducts(page, PAPER_ROLL.name)
        await expect(productTypeCell(page, PAPER_ROLL.id)).toContainText('Low · 3 on hand')
        await searchProducts(page, LABELS.name)
        await expect(productTypeCell(page, LABELS.id)).toContainText('36 on hand')
        await expect(productTypeCell(page, LABELS.id)).not.toContainText('Low')
        await searchProducts(page, service.name)
        await expect(productTypeCell(page, service.id)).toBeVisible()
        await expect(productTypeCell(page, service.id)).not.toContainText('on hand')

        // "roll" finds both: Low stock keeps the paper roll only; off, both show.
        await searchProducts(page, 'roll')
        await expect(productEntry(page, PAPER_ROLL.name)).toHaveCount(1)
        await expect(productEntry(page, LABELS.name)).toHaveCount(1)
        await setLowStockChip(page, true)
        await expect(productEntry(page, PAPER_ROLL.name)).toHaveCount(1)
        await expect(productEntry(page, LABELS.name)).toHaveCount(0)
        await setLowStockChip(page, false)
        await expect(productEntry(page, PAPER_ROLL.name)).toHaveCount(1)
        await expect(productEntry(page, LABELS.name)).toHaveCount(1)

        // No low item matches: the chip's own empty state, never with the chip off.
        const nothing = uniqueName('No such item')
        await searchProducts(page, nothing)
        await expect(shown(page, 'products-no-low')).toHaveCount(0)
        await setLowStockChip(page, true)
        await expect(shown(page, 'products-no-low')).toContainText(INVENTORY_TEXTS.noLowItems)
        await setLowStockChip(page, false)
        await expect(shown(page, 'products-no-low')).toHaveCount(0)

        // An item of its own goes low when its reorder point reaches its quantity: the
        // server writes low_stock. The Details steps are inventory-adjust-item.spec.ts's.
        const name = uniqueName('E2E Low item')
        await makeInventoryItem(page, { name, quantity: '2', value: '10.00' })
        await searchProducts(page, name)
        await setLowStockChip(page, true)
        await expect(productEntry(page, name)).toHaveCount(0)
        await setLowStockChip(page, false)
        await openItem(page, name)
        await openItemDetails(page)
        const item = itemPage(page)
        const reorder = item.getByTestId('form-input-reorder_point')
        await reorder.fill('2')
        await reorder.press('Tab')
        const saved = productPatched(page)
        await item.getByTestId('product-save').click()
        expect((await saved).status()).toBe(200)
        await expect(reorder).toHaveValue('2')
        await openInventoryTab(page, 'Products and services')
        await searchProducts(page, name)
        await setLowStockChip(page, true)
        await expect(productEntry(page, name)).toHaveCount(1)
        await setLowStockChip(page, false)

        // At 1366 the panel opens beside the list and the list's pane is below the table's
        // own minimum, so the list shows cards; the open Service's card is marked, another
        // card is not (the open product is marked on the panel surface, ProductsList).
        await page.setViewportSize(PANEL_CARDS)
        await searchProducts(page, 'setup')
        const openService = shown(page, `product-row-${PAYROLL_SETUP_ID}`)
        await openService.getByRole('button', { name: 'Payroll setup' }).click()
        await expect(shown(page, 'product-panel')).toBeVisible()
        await expect(shown(page, 'products-cards')).toBeVisible()
        const openCard = shown(page, `product-card-${PAYROLL_SETUP_ID}`)
        const otherCard = shown(page, `product-card-${WORKSTATION_SETUP_ID}`)
        await expect(otherCard).toBeVisible()
        await expect(openCard.locator('[aria-current="true"]')).toHaveCount(1)
        await expect(otherCard.locator('[aria-current="true"]')).toHaveCount(0)
        await page.getByTestId('product-close').click()
        await expect(page.getByTestId('product-panel')).toBeHidden()
        await page.setViewportSize(DESKTOP)

        // The table at 1280; at 768 with the package sidebar open the pane is below the
        // table's own minimum, so the list shows cards and no table (spec §3.10, lesson 7).
        await searchProducts(page, PAPER_ROLL.name)
        await expect(shown(page, 'products-table')).toBeVisible()
        await expect(shown(page, 'products-cards')).toHaveCount(0)
        await page.setViewportSize(TABLET)
        await expect
            .poll(() => productsPaneWidth(page), {
                message: 'the package sidebar is open beside the list at 768',
            })
            .toBeLessThan(PRODUCT_TABLE_MIN)
        await expect(shown(page, 'products-cards')).toBeVisible()
        await expect(shown(page, 'products-table')).toHaveCount(0)

        // At 390 px: the paper roll's card has the Low stock badge, its type line the stock.
        await page.setViewportSize(PHONE)
        await searchProducts(page, PAPER_ROLL.name)
        const card = shown(page, `product-card-${PAPER_ROLL.id}`)
        await expect(card).toBeVisible()
        await expect(card).toContainText('Low stock')
        await expect(card.getByText(/^Inventory · .* · 3 on hand$/)).toBeVisible()
        await searchProducts(page, LABELS.name)
        const labelsCard = shown(page, `product-card-${LABELS.id}`)
        await expect(labelsCard.getByText(/^Inventory · .* · 36 on hand$/)).toBeVisible()
        await expect(labelsCard).not.toContainText('Low stock')
        await expect(lowStockChip(page)).toBeVisible()
    })
})
