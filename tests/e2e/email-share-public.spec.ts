import { expect, type Page, type Route, test } from '@playwright/test'
import { waitForEmailTo } from '@tinycld/core/e2e-helpers'
import { UNKNOWN_INVOICE_TOKEN } from '../../tinycld/books/lib/email-share-fixture'
import { PHONE } from './account-register-helpers'
import { DESKTOP, openBooks } from './customer-form-helpers'
import {
    copyInvoiceLink,
    emailBody,
    INVOICE_LINK_PATTERN,
    invoiceLinkOf,
    invoiceTokenOfLink,
    LINK_COPIED,
    openInvoicePublicPage,
    postedInvoiceWithEmail,
    toast,
} from './email-share-helpers'
import { authToken } from './estimate-public-link-helpers'
import {
    INVOICE_URL,
    invoiceIdFromUrl,
    lineCellTestId,
    lineRowId,
    openInvoiceBySearch,
    uniqueMemo,
} from './invoice-helpers'
import { PAYMENT_URL, rowAmount } from './receive-payment-helpers'

// The customer's invoice page at /p/books/invoices/<token> (email-share spec §3.5; plan
// checkpoint 5). Every invoice a test acts on is posted through the UI with a unique memo
// for a customer with a unique name and address, and opened through search. The public
// page opens in a browser context of its own that never signed in, with its realtime
// clients tracked; its `goto` is that context's first load. The seeded invoice paid in
// full is read only (its token through a read-only signed-in GET). The business name,
// email and phone are shared settings: no test asserts their values, only what the page
// shows of them against what it reads.
//
// Not driven here: the org logo with a logo set (the e2e deployment has none), native,
// light and dark (gate 2), the loading state (gate 2 holds the view read).

const VIEW_READ = '**/api/collections/books_invoice_public/records*'

const usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

// The seeded invoice that seeded payment 1001 pays in full (receive-payment-fixture
// PAYMENT_SEED 'full': INVOICE_IDS.exempt, found by its seed memo). Read only.
async function seededPaidInvoice(page: Page): Promise<{ token: string; total: string }> {
    const token = await authToken(page)
    const row = await page.evaluate(async auth => {
        const filter = encodeURIComponent('memo="Seed invoice exempt" && status="posted"')
        const response = await fetch(
            `/api/collections/books_invoices/records?filter=${filter}&fields=public_token,total,balance`,
            { headers: { Authorization: auth } }
        )
        const body = (await response.json()) as {
            items: { public_token: string; total: number; balance: number }[]
        }
        return { ok: response.ok, items: body.items }
    }, token)
    expect(row.ok).toBe(true)
    expect(row.items).toHaveLength(1)
    const invoice = row.items[0]
    expect(invoice?.balance).toBe(0)
    expect(invoice?.public_token ?? '').toMatch(/^[A-Za-z0-9_-]{43}$/)
    return { token: invoice?.public_token ?? '', total: usd.format((invoice?.total ?? 0) / 100) }
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe('email-share: public invoice page', () => {
    test('Copy customer link opens the invoice; a paid one says so; a wrong link is refused', async ({
        page,
        browser,
    }) => {
        await openBooks(page, DESKTOP)
        const invoice = await postedInvoiceWithEmail(page)
        await openInvoiceBySearch(page, invoice.memo)
        const invoiceId = invoiceIdFromUrl(page)
        const total = (await page.getByTestId('invoice-balance-due').innerText()).trim()
        expect(total).toBe('$212.50')

        const link = await copyInvoiceLink(page)
        expect(new URL(link).origin).toBe(new URL(page.url()).origin)

        const customer = await openInvoicePublicPage(browser, link)
        try {
            const q = customer.page
            const card = q.getByTestId('invoice-public')
            await expect(card).toBeVisible()
            await expect(q.getByTestId('invoice-public-heading')).toHaveText(
                `Invoice ${invoice.number} for ${invoice.customer}`
            )
            await expect(q.getByTestId('invoice-public-balance')).toHaveText(total)
            // The whole total is still due: no "Total" line under the balance.
            await expect(q.getByTestId('invoice-public-total')).toHaveCount(0)
            await expect(q.getByTestId('invoice-public-dates')).toContainText('Invoice date ')
            await expect(q.getByTestId('invoice-public-due')).toHaveText(/^Due /)

            const businessNode = q.getByTestId('invoice-public-business')
            await expect(businessNode).not.toHaveText('')
            const business = (await businessNode.innerText()).trim()
            await expect(q).toHaveTitle(
                new RegExp(`^Invoice ${invoice.number} · ${escapeRegExp(business)}$`)
            )

            // Download PDF: the printed invoice through the token route.
            const download = q.waitForEvent('download')
            await q.getByTestId('invoice-public-pdf').click()
            const file = await download
            expect(file.suggestedFilename()).toBe(`invoice-${invoice.number}.pdf`)
            expect(new URL(file.url()).pathname).toBe(
                `/api/books/public/invoices/${invoiceTokenOfLink(link)}/pdf`
            )
            expect(await file.failure()).toBeNull()

            // The e2e book's settings row has no email and no phone (migration
            // 2100000001 writes both as '', seed.ts does not set them): no contact line.
            await expect(q.getByTestId('invoice-public-contact')).toHaveCount(0)
        } finally {
            await customer.close()
        }

        // Load error in a second public context: every view read fails until the route is
        // lifted, then Try again recovers.
        // pbtsdb reports an error only for a 4xx answer; a network abort retries forever.
        const fail = (route: Route) => route.fulfill({ status: 400 })
        const broken = await openInvoicePublicPage(browser, link, {
            beforeLoad: async q => {
                await q.route(VIEW_READ, fail)
            },
        })
        try {
            const q = broken.page
            await expect(q.getByTestId('invoice-public-error')).toContainText(
                'The invoice could not load.'
            )
            await expect(q.getByTestId('invoice-public')).toHaveCount(0)
            await q.unrouteAll({ behavior: 'wait' })
            await q.getByTestId('invoice-public-retry').click()
            await expect(q.getByTestId('invoice-public-balance')).toHaveText(total)
            await expect(q.getByTestId('invoice-public-error')).toHaveCount(0)

            // A part payment in Books shows on the next read of the page.
            await expect(
                page.getByTestId('invoice-read-receive-payment').filter({ visible: true })
            ).toBeVisible()
            await page.keyboard.press('r')
            await expect(rowAmount(page, invoiceId)).toHaveValue('212.50')
            await rowAmount(page, invoiceId).fill('106.25')
            await expect(page.getByTestId('payment-amount')).toHaveValue('106.25')
            await page.getByTestId('payment-memo').fill(uniqueMemo('Public invoice payment'))
            await page.getByTestId('payment-post').click()
            await expect(page).toHaveURL(PAYMENT_URL)
            await expect(page.getByTestId('payment-read-only')).toBeVisible()

            await q.reload()
            await expect(q.getByTestId('invoice-public-balance')).toHaveText('$106.25')
            await expect(q.getByTestId('invoice-public-total')).toHaveText(`Total ${total}`)
        } finally {
            await broken.close()
        }

        // The seeded invoice paid in full.
        const paid = await seededPaidInvoice(page)
        const paidPage = await openInvoicePublicPage(browser, invoiceLinkOf(page, paid.token))
        try {
            const q = paidPage.page
            await expect(q.getByTestId('invoice-public-paid')).toHaveText('Paid in full')
            await expect(q.getByTestId('invoice-public-total')).toHaveText(`Total ${paid.total}`)
            await expect(q.getByTestId('invoice-public-balance')).toHaveCount(0)
        } finally {
            await paidPage.close()
        }

        // A token of 43 characters that no invoice has.
        expect(UNKNOWN_INVOICE_TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/)
        const wrong = await openInvoicePublicPage(
            browser,
            invoiceLinkOf(page, UNKNOWN_INVOICE_TOKEN)
        )
        try {
            const q = wrong.page
            const notFound = q.getByTestId('invoice-public-not-found')
            await expect(notFound).toContainText('This link is not valid.')
            await expect(notFound).toContainText('Ask the business that sent it for a new link.')
            await expect(q.getByTestId('invoice-public')).toHaveCount(0)
        } finally {
            await wrong.close()
        }
    })

    test('a void invoice and a replaced invoice', async ({ page, browser }) => {
        await openBooks(page, DESKTOP)
        const voided = await postedInvoiceWithEmail(page)
        const edited = await postedInvoiceWithEmail(page)

        await openInvoiceBySearch(page, voided.memo)
        const voidLink = await copyInvoiceLink(page)
        const voidPage = await openInvoicePublicPage(browser, voidLink)
        try {
            const q = voidPage.page
            await expect(q.getByTestId('invoice-public-balance')).toBeVisible()

            // Void it in Books; the next read of the page shows it.
            await page.getByTestId('invoice-read-void').filter({ visible: true }).click()
            const dialog = page.getByTestId('void-dialog')
            await expect(dialog).toBeVisible()
            await page.getByTestId('void-confirm').click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('invoice-badge').filter({ visible: true })).toHaveText(
                'Void'
            )

            await q.reload()
            const voidCard = q.getByTestId('invoice-public-void')
            await expect(voidCard).toContainText('voided this invoice. No payment is due.')
            await expect(q.getByTestId('invoice-public-pdf')).toHaveCount(0)
            await expect(q.getByTestId('invoice-public-balance')).toHaveCount(0)
            await expect(q.getByTestId('invoice-public-total')).toHaveCount(0)
            await expect(q.getByTestId('invoice-public-paid')).toHaveCount(0)
        } finally {
            await voidPage.close()
        }

        await openInvoiceBySearch(page, edited.memo)
        const oldId = invoiceIdFromUrl(page)
        const oldLink = await copyInvoiceLink(page)

        // Edit the posted invoice and post the correction (it keeps the number).
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/invoices/new\\?replaces=${oldId}$`))
        const rowId = await lineRowId(page, 0)
        await page.getByTestId(lineCellTestId(rowId, 'quantity')).fill('2')
        await page.getByTestId('invoice-post').click()
        await expect(page).toHaveURL(INVOICE_URL)
        await expect(page).not.toHaveURL(new RegExp(`/books/invoices/${oldId}$`))
        await expect(page.getByTestId('invoice-read-only').filter({ visible: true })).toBeVisible()

        const oldPage = await openInvoicePublicPage(browser, oldLink)
        try {
            const q = oldPage.page
            await expect(q.getByTestId('invoice-public-replaced')).toContainText(
                `This invoice was replaced by invoice ${edited.number}.`
            )
            await expect(q.getByTestId('invoice-public-pdf')).toHaveCount(0)
            await q.getByTestId('invoice-public-open-replacement').click()
            await expect(q).toHaveURL(INVOICE_LINK_PATTERN)
            await expect(q).not.toHaveURL(oldLink)
            expect(invoiceTokenOfLink(q.url())).not.toBe(invoiceTokenOfLink(oldLink))
            await expect(q.getByTestId('invoice-public')).toBeVisible()
            await expect(q.getByTestId('invoice-public-heading')).toHaveText(
                `Invoice ${edited.number} for ${edited.customer}`
            )
            await expect(q.getByTestId('invoice-public-balance')).toHaveText('$425.00')
        } finally {
            await oldPage.close()
        }
    })

    test('phone (390): send from More in a Sheet, and the public card', async ({
        page,
        browser,
    }) => {
        await openBooks(page, DESKTOP)
        const invoice = await postedInvoiceWithEmail(page)
        await openInvoiceBySearch(page, invoice.memo)
        await page.setViewportSize(PHONE)

        // The phone bar: one button (Edit) beside More; Void is no longer a bar button.
        const bar = page.getByTestId('invoice-read-actions').filter({ visible: true })
        await expect(bar.getByTestId('invoice-read-edit')).toBeVisible()
        await expect(bar.getByTestId('invoice-read-void')).toHaveCount(0)
        await expect(bar.getByTestId('invoice-read-send')).toHaveCount(0)
        await expect(bar.getByTestId('invoice-read-link')).toHaveCount(0)

        await page.getByTestId('invoice-read-more').filter({ visible: true }).click()
        const sendRow = page.getByRole('menuitem', { name: /^Send…/ })
        await expect(sendRow).toBeVisible()
        await expect(page.getByRole('menuitem', { name: /^Copy customer link/ })).toBeVisible()
        await sendRow.click()

        // A Sheet has no dialog role: it is found by its title.
        await expect(
            page.getByText(`Send invoice ${invoice.number}`, { exact: true })
        ).toBeVisible()
        const toolbar = page.getByTestId('document-send-toolbar').filter({ visible: true })
        await expect(toolbar).toBeVisible()
        const formats = [
            'Bold',
            'Italic',
            'Underline',
            'Bullet list',
            'Numbered list',
            'Blockquote',
            'Link',
        ]
        const folded: string[] = []
        for (const name of formats) {
            const inline = toolbar
                .getByRole('button', { name, exact: true })
                .filter({ visible: true })
            if ((await inline.count()) === 0) folded.push(name)
        }
        if (folded.length > 0) {
            await toolbar.getByRole('button', { name: 'More actions', exact: true }).click()
            for (const name of folded) {
                await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
            }
            await page.keyboard.press('Escape')
        }

        const word = `Thanks${Date.now().toString(36)}`
        const body = emailBody(page)
        await body.click()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('Hello ')
        await toolbar.getByRole('button', { name: 'Bold', exact: true }).click()
        await expect(body).toBeFocused()
        await page.keyboard.type(word)
        await expect(body.locator('strong')).toHaveText(word)

        await page.getByTestId('document-send-submit').filter({ visible: true }).click()
        await expect(
            toast(page, `Invoice ${invoice.number} sent to ${invoice.email}`)
        ).toBeVisible()
        const email = await waitForEmailTo(invoice.email)
        expect(email.html ?? '').toContain(`<strong>${word}</strong>`)

        // Copy customer link from More, then the public card at 390: full width less the
        // page padding.
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
        await page.evaluate(() => navigator.clipboard.writeText(''))
        await page.getByTestId('invoice-read-more').filter({ visible: true }).click()
        await page.getByRole('menuitem', { name: /^Copy customer link/ }).click()
        await expect(page.getByText(LINK_COPIED, { exact: true }).first()).toBeVisible()
        await expect
            .poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toMatch(INVOICE_LINK_PATTERN)
        const link = await page.evaluate(() => navigator.clipboard.readText())
        const customer = await openInvoicePublicPage(browser, link, { viewport: PHONE })
        try {
            const card = customer.page.getByTestId('invoice-public')
            await expect(card).toBeVisible()
            await expect
                .poll(async () => (await card.boundingBox())?.width ?? 0)
                .toBeGreaterThanOrEqual(340)
            await expect
                .poll(async () => (await card.boundingBox())?.width ?? Number.NaN)
                .toBeLessThan(390)
        } finally {
            await customer.close()
        }
    })
})
