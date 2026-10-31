import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    accentOf,
    backgroundOf,
    createBundle,
    createProduct,
    openButton,
    openProductsList,
    PHONE,
    panelPlacement,
    productEntry,
    productIdOf,
    searchProducts,
    stampDigits,
    uniqueName,
    WIDE,
} from './products-services-helpers'

// The Products and services list: a product's columns and the open-product mark beside the
// panel (wide), and the phone cards with the Books New FAB.
//
// Each test creates the products it asserts on (plan review E1). The layout the spec lists
// for these tests (money right-aligned under its header, the header's column texts, the
// sideways scroll under 560 px, Name's ellipsis, the two-line phone title) is judged by the
// gate 2 critique (Decisions, "Layout is the gate 2 critique's"), so these tests assert what
// a user does and the text the list's rules produce. The 0-price and purchasing-off blanks
// are tests/product-list.test.ts (`productPriceText`, `productCostText`).
//
// Not covered here: read-only users cannot be driven (no read-only Books member is seeded).

// The products are created at the default viewport, where the rail links that
// navigateToPackage clicks are present; each test then sets its own size.
async function openBooksAtDefaultViewport(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
}

// Core's New FAB, named "New".
function newFab(page: Page) {
    return page.getByLabel('New', { exact: true })
}

test.describe('products-services: list', () => {
    // At WIDE only: the panel exists only from a 1360 px window, and the table's cells are
    // the same code at 1280.
    test("shows a product's columns and marks it open beside the panel (wide)", async ({
        page,
    }) => {
        await openBooksAtDefaultViewport(page)
        const prefix = uniqueName(page, 'Cols')
        const sku = `HW-${stampDigits()}`
        const name = `${prefix} AP`
        const kit = `${prefix} kit`
        await createProduct(page, {
            type: 'non_inventory',
            name,
            sku,
            price: '189',
            cost: '121.40',
            expenseAccount: '6200 Software Subscriptions',
        })
        await createBundle(page, { name: kit, items: [] })

        await page.setViewportSize(WIDE)
        await searchProducts(page, prefix)
        const id = await productIdOf(page, name)
        const kitId = await productIdOf(page, kit)
        await expect(page.getByTestId(`product-cell-sku-${id}`)).toHaveText(sku)
        await expect(page.getByTestId(`product-cell-type-${id}`)).toHaveText('Non-inventory')
        await expect(page.getByTestId(`product-cell-price-${id}`)).toHaveText('$189.00')
        await expect(page.getByTestId(`product-cell-cost-${id}`)).toHaveText('$121.40')
        await expect(page.getByTestId(`product-cell-type-${kitId}`)).toHaveText('Bundle')
        await expect(page.getByTestId(`product-cell-price-${kitId}`)).toHaveText('')
        await expect(page.getByTestId(`product-cell-cost-${kitId}`)).toHaveText('')

        await openButton(page, name).click()
        await expect
            .poll(() => panelPlacement(page))
            .toEqual({ widthIs480: true, atContentRight: true, listToItsLeft: true })
        await page.mouse.move(0, 0)
        const row = page.getByTestId(`product-row-${id}`)
        const accent = await accentOf(page, `product-row-${id}`)
        await expect.poll(() => backgroundOf(row)).toBe(accent)
        await expect(page.getByTestId(`product-menu-${id}`)).toBeVisible()

        await page.getByTestId('product-close').click()
        await expect(page.getByTestId('product-panel')).toBeHidden()
    })

    // At PHONE only: the phone path renders `ProductCard` and the Books New FAB, other code
    // than the desktop table.
    test('opens a product from its card and hides the FAB on its page (phone)', async ({
        page,
    }) => {
        await openBooksAtDefaultViewport(page)
        const name = uniqueName(page, 'Card')
        const sku = `SKU-${stampDigits()}`
        await createProduct(page, { type: 'non_inventory', name, sku, price: '189' })

        await page.setViewportSize(PHONE)
        await openProductsList(page)
        await expect(page.getByTestId('products-cards')).toBeVisible()
        await expect(page.getByTestId('products-table')).toHaveCount(0)
        await expect(page.getByTestId('product-new-header')).toHaveText('New product or service')
        await expect(newFab(page)).toBeVisible()

        await searchProducts(page, name)
        const card = productEntry(page, name)
        await expect(card.getByText(name, { exact: true })).toBeVisible()
        await expect(card.getByText('Non-inventory · $189.00', { exact: true })).toBeVisible()
        await expect(card.getByText(sku, { exact: true })).toBeVisible()

        await openButton(page, name).click()
        await expect(page.getByTestId('product-page')).toBeVisible()
        await expect(page.getByTestId('product-page')).toContainText('Edit non-inventory item')
        await expect(newFab(page)).toBeHidden()

        await page.getByTestId('product-back').click()
        await expect(page.getByTestId('products-list')).toBeVisible()
        await expect(newFab(page)).toBeVisible()
    })
})
