import { expect, type Page, test } from '@playwright/test'
import {
    bundleRowNames,
    createBundle,
    createProduct,
    DESKTOP,
    discardDialog,
    exactText,
    expectSavedToList,
    field,
    isBundleItemsUrl,
    isRecordUrl,
    openBooks,
    openNewProduct,
    openProduct,
    PHONE,
    productEntry,
    productSurface,
    refusalToast,
    searchProducts,
    stacked,
    uniqueName,
} from './products-services-helpers'

// Bundles: the item rows load with the form, save in row order, reorder, show as cards on
// a phone, and a new bundle whose item is refused stays saved and opens.
//
// Each test creates its items and bundle through the form with `uniqueName` and edits no
// seeded row. The `Item <n>` root refusal of an edit is tests/use-record-save-rows.test.tsx
// (case g) and tests/record-save.test.ts. A refusal is a 400 answered through `page.route`,
// which drives the UI's write and seeds nothing.
//
// Not covered here: read-only users cannot be driven (no read-only Books member is seeded).
// A user who leaves the new form before an item is refused is not moved to the saved
// bundle (`useIsShowingNewProduct`); no test in this unit drives that path.

type ItemWrite = { id: string; body: Record<string, unknown> }

function itemIdOf(url: URL) {
    const match = /\/books_bundle_items\/records\/([^/]+)$/.exec(url.pathname)
    return match ? match[1] : ''
}

// Every `method` request to the bundle items endpoint, in the order sent.
function itemWrites(page: Page, method: 'POST' | 'PATCH' | 'DELETE') {
    const writes: ItemWrite[] = []
    page.on('request', request => {
        const url = new URL(request.url())
        if (request.method() !== method || !isBundleItemsUrl(url)) return
        writes.push({ id: itemIdOf(url), body: request.postDataJSON() ?? {} })
    })
    return writes
}

const itemPosts = (page: Page) => itemWrites(page, 'POST')
const itemPatches = (page: Page) => itemWrites(page, 'PATCH')
const itemDeletes = (page: Page) => itemWrites(page, 'DELETE')

// The PATCHes of the bundle's own `books_products` record.
function productWrites(page: Page, id: string) {
    const urls: string[] = []
    const matches = isRecordUrl(id)
    page.on('request', request => {
        if (request.method() === 'PATCH' && matches(new URL(request.url()))) {
            urls.push(request.url())
        }
    })
    return urls
}

function bundleRows(page: Page) {
    return productSurface(page).locator('[data-testid^="form-table-items-row-"]')
}

async function bundleRowIds(page: Page) {
    return bundleRows(page).evaluateAll(els =>
        els.map(el => (el.getAttribute('data-testid') ?? '').slice('form-table-items-row-'.length))
    )
}

async function bundleRowQuantities(page: Page) {
    const quantities: string[] = []
    for (const rowId of await bundleRowIds(page)) {
        quantities.push(await page.getByTestId(`form-table-items-${rowId}-quantity`).inputValue())
    }
    return quantities
}

// Adds a row to the open bundle form and fills it with the product named `name`.
async function addBundleRow(page: Page, name: string, quantity: string) {
    const count = await bundleRows(page).count()
    await page.getByTestId('form-table-items-add').click()
    await expect(bundleRows(page)).toHaveCount(count + 1)
    const ids = await bundleRowIds(page)
    const cell = `form-table-items-${ids[ids.length - 1]}`
    await page.getByTestId(`${cell}-product`).click()
    await page.getByTestId(`${cell}-product-search`).fill(name)
    await page
        .locator(`[data-testid^="${cell}-product-option-"]`)
        .filter({ hasText: exactText(name) })
        .click()
    await page.getByTestId(`${cell}-quantity`).fill(quantity)
}

// A product's own URL, not the new form's.
const SAVED_PRODUCT_URL = /\/books\/products\/(?!new(\?|$))[^/?]+$/

function shownProductId(page: Page) {
    const match = /\/books\/products\/([^/]+)$/.exec(new URL(page.url()).pathname)
    return match ? match[1] : ''
}

test.describe('products-services: bundles', () => {
    test("reorders a bundle's items and keeps the order (desktop)", async ({ page }) => {
        await openBooks(page, DESKTOP)
        const title = page.getByTestId('product-title')
        const prefix = uniqueName(page, 'Kit')
        const nameA = `${prefix} A`
        const nameB = `${prefix} B`
        await createProduct(page, { type: 'service', name: nameA })
        await createProduct(page, { type: 'service', name: nameB })

        // The new bundle form: the type is fixed, there is no price, cost or account, and
        // the item table starts empty.
        await openNewProduct(page, 'bundle')
        await expect(title).toHaveText('New bundle')
        await expect(page.getByTestId('form-input-type')).toContainText('Bundle')
        await expect(page.getByTestId('form-input-type')).toContainText('A bundle keeps its type.')
        for (const key of ['price', 'income_account', 'purchases', 'cost']) {
            await expect(page.getByTestId(`form-field-${key}`)).toHaveCount(0)
        }
        await expect(page.getByTestId('form-table-items-empty')).toBeVisible()
        await page.getByTestId('product-cancel').click()
        await expect(page).toHaveURL(/\/books\/products$/)

        // A new bundle writes its rows after the product, in row order.
        const posts = itemPosts(page)
        await createBundle(page, {
            name: prefix,
            items: [
                { name: nameA, quantity: '1' },
                { name: nameB, quantity: '2.5' },
            ],
        })
        await expect.poll(() => posts.length).toBe(2)
        expect(posts.map(post => post.body.position)).toEqual([0, 1])
        expect(posts.map(post => post.body.quantity)).toEqual([1, 2.5])
        const rowOfA = String(posts[0].body.id)
        const rowOfB = String(posts[1].body.id)

        await openProduct(page, prefix)
        await expect(title).toHaveText('Edit bundle')
        await expect.poll(() => bundleRowNames(page)).toEqual([nameA, nameB])
        const id = shownProductId(page)
        expect(id).not.toBe('')

        const patches = itemPatches(page)
        const deletes = itemDeletes(page)
        const ownWrites = productWrites(page, id)
        const [, second] = await bundleRowIds(page)
        await page.getByTestId(`form-table-items-${second}-up`).click()
        await expect.poll(() => bundleRowNames(page)).toEqual([nameB, nameA])

        await page.getByTestId('product-save').click()
        await expectSavedToList(page)
        await expect.poll(() => patches.length).toBe(2)
        const positions = Object.fromEntries(patches.map(patch => [patch.id, patch.body.position]))
        expect(positions).toEqual({ [rowOfB]: 0, [rowOfA]: 1 })

        // The saved order comes back, and the rows-only edit wrote nothing else.
        await openProduct(page, prefix)
        await expect.poll(() => bundleRowNames(page)).toEqual([nameB, nameA])
        expect(await bundleRowQuantities(page)).toEqual(['2.5', '1'])
        expect(posts).toHaveLength(2)
        expect(deletes).toHaveLength(0)
        expect(ownWrites).toHaveLength(0)
        await page.getByTestId('product-cancel').click()
        await expect(page.getByTestId('products-list')).toBeVisible()
    })

    test('lays the bundle out in one column with card rows on a phone (phone)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const item = uniqueName(page, 'Ties')
        const bundle = `${item} kit`
        await createProduct(page, { type: 'non_inventory', name: item })
        await createBundle(page, { name: bundle, items: [{ name: item, quantity: '1' }] })

        await page.setViewportSize(PHONE)
        await openProduct(page, bundle)
        await expect(page.getByTestId('form-table-items-cards')).toBeVisible()
        await expect(page.getByTestId('form-table-items-grid')).toHaveCount(0)
        await expect(bundleRows(page)).toHaveCount(1)
        const [rowId] = await bundleRowIds(page)
        const trigger = page.getByTestId(`form-table-items-${rowId}-product`)
        await expect(trigger).toContainText(item)
        await expect.poll(() => stacked(field(page, 'name'), field(page, 'sku'))).toBe(true)

        // Nothing was changed, so Cancel asks no question.
        await page.getByTestId('product-cancel').click()
        await expect(discardDialog(page).title).toHaveCount(0)
        await expect(page.getByTestId('products-list')).toBeVisible()
    })

    test('saves a new bundle when an item is refused and opens it with the items that were written (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const item = uniqueName(page, 'Part')
        const bundle = `${item} kit`
        await createProduct(page, { type: 'service', name: item })

        // A product may be on two rows.
        await openNewProduct(page, 'bundle')
        await field(page, 'name').fill(bundle)
        await addBundleRow(page, item, '1')
        await addBundleRow(page, item, '2')

        let posts = 0
        await page.route(
            url => isBundleItemsUrl(url),
            route => {
                if (route.request().method() !== 'POST') return route.continue()
                posts += 1
                if (posts !== 2) return route.continue()
                return route.fulfill({
                    status: 400,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        code: 400,
                        message: 'A bundle holds at most 50 items.',
                        data: {},
                    }),
                })
            }
        )
        await page.getByTestId('product-save').click()

        await expect(
            refusalToast(
                page,
                'The bundle was saved, but an item was not: A bundle holds at most 50 items.'
            )
        ).toBeVisible()
        await expect(page).toHaveURL(SAVED_PRODUCT_URL)
        await expect(page.getByTestId('product-title')).toHaveText('Edit bundle')
        await expect(field(page, 'name')).toHaveValue(bundle)
        await expect.poll(() => bundleRowNames(page)).toEqual([item])
        await expect(discardDialog(page).title).toHaveCount(0)

        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('product-cancel').click()
        await expect(page.getByTestId('products-list')).toBeVisible()
        await searchProducts(page, bundle)
        await expect(productEntry(page, bundle)).toBeVisible()
    })
})
