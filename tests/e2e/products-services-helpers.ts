import { expect, type Page } from '@playwright/test'
import { type RecordKind, recordFormHelpers } from './record-form-helpers'

// Shared by the products-services e2e specs: the product bindings of
// record-form-helpers.ts. Products are created by driving the form; the one seeded
// product a spec writes is named in that spec's header.

export {
    afterNextFrames,
    backgroundOf,
    CLASSIC_SCROLLBARS,
    DESKTOP,
    edges,
    effectiveOpacity,
    expectTextInsideCell,
    holdLoads,
    isDisabled,
    isPhone,
    leaveBooks,
    leftEdgeOf,
    navigateInApp,
    openBooks,
    openBooksPage,
    type PatchAnswer,
    PHONE,
    refusalToast,
    refusedWrites,
    returnToBooks,
    SETTINGS_URL,
    settle,
    sideBySide,
    stacked,
    stampDigits,
    TABLET,
    takesClickAtCenter,
    textLeft,
    textTop,
    uniqueName,
    WIDE,
} from './record-form-helpers'

export const PRODUCT_KIND: RecordKind = {
    recordPrefix: 'product',
    listPrefix: 'products',
    pathSegment: 'products',
    collection: 'books_products',
    listCard: 'books-list-card-products',
    newTitle: 'New product or service',
    deleteTitle: 'Delete product or service',
    discardMessage: 'This product has changes that are not saved.',
}

export const productHelpers = recordFormHelpers(PRODUCT_KIND)

export const productEntries = productHelpers.entries
export const productEntry = productHelpers.entry
export const productSurface = productHelpers.surface
export const openProductsList = productHelpers.openList
export const searchProducts = productHelpers.search
export const productIdOf = productHelpers.idOf
export const openProduct = productHelpers.open
export const field = productHelpers.field
// The New button opens the type chooser, titled "New product or service".
export const openChooser = productHelpers.openNew
export const discardDialog = productHelpers.discardDialog
export const productsBase = productHelpers.base
export const pressEscapeOutsideInputs = productHelpers.pressEscapeOutsideInputs
export const expectEntriesInOrder = productHelpers.expectEntriesInOrder
export const panelPlacement = productHelpers.panelPlacement
export const listSpansContent = productHelpers.listSpansContent
export const openButton = productHelpers.openButton
export const menuItem = productHelpers.menuItem
export const openMenu = productHelpers.openMenu
export const closeMenu = productHelpers.closeMenu
export const chooseFromMenu = productHelpers.chooseFromMenu
export const deleteDialog = productHelpers.deleteDialog
export const openDeleteDialog = productHelpers.openDeleteDialog
export const inactiveLabel = productHelpers.inactiveLabel
export const isRecordUrl = productHelpers.isRecordUrl
export const isRecordsUrl = productHelpers.isRecordsUrl
export const patchAnswered = productHelpers.patchAnswered
export const insertAnswered = productHelpers.insertAnswered
// `headerRowWidth` is not bound: it finds only a Name, Email, Phone header row. Specs
// read `products-header`.

type ChosenType = 'service' | 'non_inventory' | 'bundle'

// From anywhere in Books to an empty New form of `type`, through the chooser.
export async function openNewProduct(page: Page, type: ChosenType) {
    await openChooser(page)
    await page.getByTestId(`product-type-${type}`).click()
    await expect(page.getByTestId('product-form')).toBeVisible()
}

// The items of an open select menu, without its trigger: core SelectInput names each
// item `${testID}-${value}`.
export function selectItems(page: Page, key: string) {
    return page.locator(`[data-testid^="form-input-${key}-"]`)
}

// Opens the select of `key` and picks the item whose trimmed text is `label` (an
// account item may carry an indent).
export async function pickOption(page: Page, key: string, label: string) {
    await page.getByTestId(`form-input-${key}`).click()
    const items = selectItems(page, key)
    await expect(items.first()).toBeVisible()
    await items.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) }).click()
    await expect(items).toHaveCount(0)
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The "I purchase this from a vendor" switch: the cell's `form-input-purchases` is the
// toggle's wrapper, and core's Switch inside it is the element that takes the press.
export function purchasesSwitch(page: Page) {
    return page.getByTestId('form-input-purchases').getByRole('switch')
}

// Creates a Service or Non-inventory product through the form and waits for the list.
export async function createProduct(
    page: Page,
    values: {
        type: 'service' | 'non_inventory'
        name: string
        sku?: string
        price?: string
        cost?: string
        expenseAccount?: string
    }
) {
    await openNewProduct(page, values.type)
    await field(page, 'name').fill(values.name)
    if (values.sku !== undefined) await field(page, 'sku').fill(values.sku)
    if (values.price !== undefined) {
        await field(page, 'price').fill(values.price)
        await field(page, 'price').press('Tab')
    }
    if (values.cost !== undefined) {
        await purchasesSwitch(page).click()
        await field(page, 'cost').fill(values.cost)
        await field(page, 'cost').press('Tab')
        if (values.expenseAccount !== undefined) {
            await pickOption(page, 'expense_account', values.expenseAccount)
        }
    }
    await page.getByTestId('product-save').click()
    await expect(page.getByTestId('products-list')).toBeVisible()
    await expect(productSurface(page)).toBeHidden()
}

// The bundle table's rows, in screen order (the grid on desktop, the cards on a phone).
function bundleRows(page: Page) {
    return productSurface(page).locator('[data-testid^="form-table-items-row-"]')
}

async function lastBundleRowId(page: Page) {
    const testId = await bundleRows(page).last().getAttribute('data-testid')
    if (!testId) throw new Error('no bundle row')
    return testId.slice('form-table-items-row-'.length)
}

// Creates a bundle through the form, one item row per entry, and waits for the list.
export async function createBundle(
    page: Page,
    values: { name: string; items: readonly { name: string; quantity: string }[] }
) {
    await openNewProduct(page, 'bundle')
    await field(page, 'name').fill(values.name)
    for (const [index, item] of values.items.entries()) {
        await page.getByTestId('form-table-items-add').click()
        await expect(bundleRows(page)).toHaveCount(index + 1)
        const rowId = await lastBundleRowId(page)
        const cell = `form-table-items-${rowId}`
        await page.getByTestId(`${cell}-product`).click()
        await page.getByTestId(`${cell}-product-search`).fill(item.name)
        await page
            .locator(`[data-testid^="${cell}-product-option-"]`)
            .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(item.name)}\\s*$`) })
            .click()
        await page.getByTestId(`${cell}-quantity`).fill(item.quantity)
    }
    await page.getByTestId('product-save').click()
    await expect(page.getByTestId('products-list')).toBeVisible()
}

// The product names the bundle rows' pickers show, in row order.
export async function bundleRowNames(page: Page) {
    const rows = bundleRows(page)
    const ids = await rows.evaluateAll(els =>
        els.map(el => (el.getAttribute('data-testid') ?? '').slice('form-table-items-row-'.length))
    )
    const names: string[] = []
    for (const rowId of ids) {
        const text = await page.getByTestId(`form-table-items-${rowId}-product`).textContent()
        names.push((text ?? '').trim())
    }
    return names
}

// The bundle items endpoint, for a create (no id) or one item's write.
export function isBundleItemsUrl(url: URL) {
    return /\/api\/collections\/books_bundle_items\/records(\/[^/]+)?$/.test(url.pathname)
}
