import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import {
    LIST_MARGIN,
    listWidth,
    rightEdge,
    sidewaysOverflow,
    viewportForListWidth,
} from './payment-grid-width-helpers'
import {
    customerWithInvoices,
    localDay,
    NEW_PAYMENT_URL,
    openNewPayment,
    paymentCard,
    paymentRow,
    pickPaymentCustomer,
    rowAmount,
} from './receive-payment-helpers'

// The Receive Payment grid against its list's own width (human, eval revise 1 of
// pay-bills): every data column flexes with a least width of 95 px, so the grid needs
// tick 44 + 5 × 95 + 5 gaps of 12 + 2 × 8 padding = 595 px. A list a little wider shows
// the grid with no sideways scroll; a list a little narrower shows cards. The viewport for
// each list width is measured in the page (the layout decides the list's share), then the
// form is opened again at that viewport, so it is laid out at its width, not resized into
// it (lessons 16, 48). Each test makes its own customer and invoice.

const GRID_MIN_WIDTH = 44 + 5 * 95 + 5 * 12 + 2 * 8

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// Opens a new payment, finds the viewport that gives its outstanding list `target` px,
// leaves, and opens a new payment again at that viewport.
async function openPaymentWithListWidth(page: Page, target: number) {
    await openNewPayment(page)
    const viewport = await viewportForListWidth(page, 'payment-outstanding', target)
    await page.goBack()
    await expect(page).not.toHaveURL(NEW_PAYMENT_URL)
    await page.setViewportSize(viewport)
    await openNewPayment(page)
    return viewport
}

test.describe('pay-bills: receive-payment grid width', () => {
    test('a list a little wider than the grid’s least width shows the whole grid', async ({
        page,
    }) => {
        await openBooks(page)
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '310.00', dueDate: await localDay(page, 12) },
        ])
        const [invoice] = invoices
        const viewport = await openPaymentWithListWidth(page, GRID_MIN_WIDTH + LIST_MARGIN)
        await pickPaymentCustomer(page, name)

        await expect
            .poll(() => listWidth(page, 'payment-outstanding'))
            .toBeGreaterThan(GRID_MIN_WIDTH)
        const grid = page.getByTestId('payment-grid').filter({ visible: true })
        await expect(grid).toBeVisible()
        await expect(page.getByTestId('payment-cards')).toHaveCount(0)
        await expect(paymentRow(page, invoice.id)).toBeVisible()

        // Nothing around the grid scrolls sideways: the grid fits its list.
        await expect.poll(() => sidewaysOverflow(grid)).toEqual([])

        // The Payment column is inside the viewport and inside the list.
        const amount = rowAmount(page, invoice.id)
        await expect(amount).toBeVisible()
        const list = page.getByTestId('payment-outstanding').filter({ visible: true })
        await expect.poll(() => rightEdge(amount)).toBeLessThanOrEqual(viewport.width)
        await expect
            .poll(async () => (await rightEdge(amount)) <= (await rightEdge(list)) + 1)
            .toBe(true)
    })

    test('a list a little narrower than the grid’s least width shows cards', async ({ page }) => {
        await openBooks(page)
        const { name, invoices } = await customerWithInvoices(page, [
            { rate: '180.00', dueDate: await localDay(page, 8) },
        ])
        const [invoice] = invoices
        await openPaymentWithListWidth(page, GRID_MIN_WIDTH - LIST_MARGIN)
        await pickPaymentCustomer(page, name)

        await expect.poll(() => listWidth(page, 'payment-outstanding')).toBeLessThan(GRID_MIN_WIDTH)
        await expect(page.getByTestId('payment-cards')).toBeVisible()
        await expect(page.getByTestId('payment-grid')).toHaveCount(0)
        await expect(paymentCard(page, invoice.id)).toContainText(`Invoice ${invoice.number}`)
    })
})
