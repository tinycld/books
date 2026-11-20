import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { DESKTOP } from './account-register-helpers'
import { openAuditLog, openHistoryFromRow } from './audit-log-helpers'
import { invoiceIdFromUrl, uniqueMemo } from './invoice-helpers'
import { searchEntries } from './journal-entries-helpers'
import {
    BAD_DEBTS,
    invoiceToWriteOff,
    openWriteOffFromInvoice,
    WRITE_OFF_URL,
    writeOffOpenInvoice,
} from './write-off-helpers'

// The write-off page, books/write-offs/<id> (write-off spec §3.5, §3.6): its header, band
// and stamps, the void from the keyboard, the journal entry it posts, and the open paths
// that lead to it (the invoice's Write-offs section, the Journal Entries list, Books search,
// the Audit Log's history). Each test makes its own customer and invoice through the UI
// and writes it off to 6050 Bad debts (plan decision 10). No setting is changed.
//
// Test ids follow the scratch route's write-off page (plan: "the build uses the scratch
// route's id"): the header's `write-off-title`, `write-off-badge` and `write-off-amount`
// (DocumentHeader with chrome testId 'write-off'), the band's `write-off-detail-*`, and the
// bar's `write-off-read-void`, `write-off-read-invoice`, `write-off-read-entry`.
//
// Not driven here (plan notes): the page's loading, error, not-found and offline states
// (unit-tested writeOffScreenState and writeOffVoidDisabled) and the reader's bar
// (writeOffReadActions; gate 2's read-reader shots).

async function openBooks(page: Page) {
    await login(page)
    await navigateToPackage(page, 'books')
    await page.setViewportSize(DESKTOP)
}

// The element of the screen on top: Books keeps an earlier screen mounted and hidden under
// a pushed one.
function shown(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]:visible`)
}

function invoiceUrlOf(id: string) {
    return new RegExp(`/books/invoices/${id}$`)
}

// The Write-offs section's rows: `invoice-write-off-<id>`, never its links
// (`invoice-write-offs-open-<id>`) or the section's own `invoice-write-offs-…` ids.
function writeOffRows(section: Locator) {
    return section.locator('[data-testid^="invoice-write-off-"]')
}

// The number of the write-off whose page is on top, read from its title.
async function writeOffNumber(page: Page): Promise<string> {
    const title = shown(page, 'write-off-title')
    await expect(title).toHaveText(/^Write-off \d+$/)
    const number = /^Write-off (\d+)$/.exec(await title.innerText())?.[1]
    if (!number) throw new Error('no write-off number in the title')
    return number
}

// The first write-off of the invoice on top: its id and number, from the section's link.
async function sectionWriteOff(page: Page): Promise<{ id: string; number: string }> {
    const link = shown(page, 'invoice-write-offs')
        .locator('[data-testid^="invoice-write-offs-open-"]')
        .first()
    await expect(link).toHaveText(/^\d+$/)
    const id = ((await link.getAttribute('data-testid')) ?? '').replace(
        /^invoice-write-offs-open-/,
        ''
    )
    return { id, number: (await link.innerText()).trim() }
}

// Desktop sidebar: Journal Entries, pushed over the screen on top.
async function openEntriesFromSidebar(page: Page) {
    const navItem = page.getByTestId('books-nav-entries')
    if (!(await navItem.isVisible())) await page.getByTestId('books-nav-accounting-toggle').click()
    await navItem.click()
    await expect(shown(page, 'entries-screen')).toBeVisible()
}

test.describe('write-off: page', () => {
    test('voids a write-off from the keyboard only', async ({ page }) => {
        await openBooks(page)
        await invoiceToWriteOff(page, 'Write-off page void')
        const invoiceId = invoiceIdFromUrl(page)
        await writeOffOpenInvoice(page)
        await openWriteOffFromInvoice(page)
        const number = await writeOffNumber(page)

        // From here on, keys only.
        await expect(shown(page, 'write-off-title')).toHaveText(`Write-off ${number}`)
        await expect(shown(page, 'write-off-badge')).toHaveText('Posted')
        await expect(shown(page, 'write-off-amount')).toHaveText('$400.00')
        await expect(shown(page, 'write-off-detail-account')).toContainText(BAD_DEBTS)
        await expect(shown(page, 'write-off-posted-by')).toHaveText(/^Posted by \S.* on \S/)
        await expect(shown(page, 'write-off-voided-by')).toHaveCount(0)

        await page.keyboard.press('v')
        const dialog = page.getByTestId('void-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Void write-off ${number}?`)
        await expect(dialog).toContainText("The invoice's balance due rises by $400.00 again.")
        await expect(page.getByTestId('void-confirm')).toContainText('Void write-off')
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(dialog).toHaveCount(0)
        await expect(shown(page, 'write-off-badge')).toHaveText('Void')
        await expect(shown(page, 'write-off-voided-by')).toHaveText(/^Voided by \S.* on \S/)
        await expect(page.getByTestId('write-off-read-void')).toHaveCount(0)
        await expect(shown(page, 'write-off-read-invoice')).toBeVisible()
        await expect(shown(page, 'write-off-read-entry')).toBeVisible()

        // V is no longer registered: it opens nothing. The search palette's key after it
        // proves the page handled the V first.
        await page.keyboard.press('v')
        await page.keyboard.press('/')
        await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
        await expect(page.getByTestId('void-dialog')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)

        // I opens the invoice: open again for its whole total. The invoice read view is
        // right below the write-off page, so I pops to it: one copy of the invoice read
        // view stays mounted, and the write-off page is gone (lesson 12).
        await page.keyboard.press('i')
        await expect(page).toHaveURL(invoiceUrlOf(invoiceId))
        await expect(shown(page, 'invoice-read-only')).toBeVisible()
        await expect(page.locator('[data-testid="invoice-read-only"]')).toHaveCount(1)
        await expect(page.locator('[data-testid="write-off-read-only"]')).toHaveCount(0)
        await expect(shown(page, 'invoice-badge')).toHaveText('Posted')
        await expect(shown(page, 'invoice-balance-due')).toHaveText('$400.00')
        await expect(shown(page, 'invoice-total-written-off')).toHaveCount(0)
        await expect(shown(page, 'invoice-read-write-off')).toBeVisible()
        const section = shown(page, 'invoice-write-offs')
        await expect(writeOffRows(section)).toHaveCount(1)
        await expect(writeOffRows(section).first()).toContainText('Void')
    })

    test('opens the journal entry and comes back', async ({ page }) => {
        await openBooks(page)
        const reason = uniqueMemo('Write-off page entry')
        const { customer } = await invoiceToWriteOff(page, 'Write-off page entry')
        const invoiceId = invoiceIdFromUrl(page)
        await writeOffOpenInvoice(page, reason)
        await openWriteOffFromInvoice(page)
        const writeOffUrl = page.url()
        const number = await writeOffNumber(page)

        // J: the write-off's own entry.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(/\/books\/entries\/[a-z0-9]{15}$/)
        const entryId = /\/books\/entries\/([a-z0-9]{15})$/.exec(page.url())?.[1] ?? ''
        const entry = page.getByTestId('entry-read-only').filter({ visible: true })
        await expect(entry).toBeVisible()
        await expect(entry.getByTestId('entry-detail-type')).toContainText('Write-off')
        const accounts = entry.locator('[data-testid^="entry-line-account-"]')
        await expect(accounts).toHaveCount(2)
        const lines = await entry.evaluate(root => {
            const text = (id: string) =>
                (
                    (root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)
                        ?.innerText ?? ''
                ).trim()
            return [0, 1].map(i => ({
                account: text(`entry-line-account-${i}`),
                party: text(`entry-line-party-${i}`),
                debit: text(`entry-line-debit-${i}`),
                credit: text(`entry-line-credit-${i}`),
            }))
        })
        const debit = lines.find(line => line.account === BAD_DEBTS)
        const credit = lines.find(line => /Accounts receivable$/.test(line.account))
        expect(debit, 'a line on 6050 Bad debts').toMatchObject({
            debit: '$400.00',
            party: customer,
        })
        expect(credit, 'a line on Accounts receivable').toMatchObject({
            credit: '$400.00',
            party: customer,
        })
        await expect(entry.getByTestId('entry-edit')).toHaveCount(0)
        await expect(entry.getByRole('button', { name: 'Reverse', exact: true })).toHaveCount(0)

        // Back on the write-off page, its back link names the invoice below and returns
        // to it with one press.
        await page.goBack()
        await expect(page).toHaveURL(writeOffUrl)
        const back = shown(page, 'entry-back')
        await expect(back).toHaveCount(1)
        await expect(back).toHaveText('Invoice')
        await back.click()
        await expect(page).toHaveURL(invoiceUrlOf(invoiceId))
        await expect(shown(page, 'invoice-read-only')).toBeVisible()
        await expect(shown(page, 'write-off-read-only')).toHaveCount(0)

        // Journal Entries: Type Write-off with its number; Open leads to the write-off,
        // and there is no Edit and no Reverse.
        await openEntriesFromSidebar(page)
        await searchEntries(page, reason)
        await expect(page.getByTestId(`entries-cell-type-${entryId}`)).toHaveText('Write-off')
        await expect(page.getByTestId(`entries-cell-number-${entryId}`)).toHaveText(number)
        await page.getByTestId(`entries-row-menu-${entryId}`).click()
        await expect(page.getByTestId('entries-menu-edit')).toHaveCount(0)
        await expect(page.getByTestId('entries-menu-reverse')).toHaveCount(0)
        await page.getByTestId('entries-menu-open').click()
        await expect(page).toHaveURL(WRITE_OFF_URL)
        await expect(page).toHaveURL(writeOffUrl)
        await expect(shown(page, 'write-off-title')).toHaveText(`Write-off ${number}`)

        // The entry page reached by J opens its document: its Void (a document's entry is
        // voided from its document, voidsFromDocument) leads to the write-off page.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(new RegExp(`/books/entries/${entryId}$`))
        const entryAgain = page.getByTestId('entry-read-only').filter({ visible: true })
        await expect(entryAgain).toBeVisible()
        await entryAgain.getByRole('button', { name: 'Void', exact: true }).click()
        await expect(page).toHaveURL(WRITE_OFF_URL)
        await expect(page).toHaveURL(writeOffUrl)
        await expect(shown(page, 'write-off-title')).toHaveText(`Write-off ${number}`)
    })

    test('search and history open the write-off', async ({ page }) => {
        await openBooks(page)
        const reason = uniqueMemo('Write-off page search')
        const { customer } = await invoiceToWriteOff(page, 'Write-off page search')
        await writeOffOpenInvoice(page, reason)
        const { id, number } = await sectionWriteOff(page)
        const writeOffUrl = new RegExp(`/books/write-offs/${id}$`)

        // Books search: the reason finds the write-off.
        await page.keyboard.press('/')
        const input = page.getByRole('dialog', { name: 'Search' }).getByRole('textbox')
        await expect(input).toBeFocused()
        const searched = page.waitForResponse(
            r =>
                r.url().includes('/api/search') &&
                r.status() === 200 &&
                new URL(r.url()).searchParams.get('q') === reason
        )
        await page.keyboard.type(reason)
        await searched
        const option = page
            .getByRole('option')
            .filter({ hasText: `Write-off ${number} · ${customer}` })
        await expect(option).toHaveCount(1)
        await option.click()
        await expect(page).toHaveURL(WRITE_OFF_URL)
        await expect(page).toHaveURL(writeOffUrl)
        await expect(shown(page, 'write-off-detail-reason')).toContainText(reason)

        // Audit Log: the write-off's row opens its history, whose Open leads to the page.
        await openAuditLog(page)
        await openHistoryFromRow(page, { record: `Write-off ${number}`, event: 'Added' })
        await expect(page).toHaveURL(new RegExp(`/books/history/books_write_offs/${id}$`))
        await shown(page, 'history-open').click()
        await expect(page).toHaveURL(WRITE_OFF_URL)
        await expect(page).toHaveURL(writeOffUrl)
        const readView = shown(page, 'write-off-read-only')
        await expect(readView).toBeVisible()

        // The page's help icon opens the Write-offs topic: its title, and a heading of the
        // topic that no text of the page holds.
        await readView.getByLabel('Open help').click()
        await expect(
            page
                .getByText('Write off an invoice', { exact: true })
                .filter({ visible: true })
                .first()
        ).toBeVisible()
        await expect(
            page
                .getByText('A customer who paid a part', { exact: true })
                .filter({ visible: true })
                .first()
        ).toBeVisible()
    })
})
