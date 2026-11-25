import { expect, type Page, test } from '@playwright/test'
import { customerPath, DESKTOP, isDisabled, openBooks } from './customer-form-helpers'
import { tabTo } from './keyboard-helpers'
import { localDay } from './receive-payment-helpers'
import {
    customerEmailOf,
    newStatementUrl,
    openNewStatementFor,
    type StatementCustomer,
    statementCustomer,
    statementsOf,
    uniqueEmail,
} from './statements-helpers'

// Create statements, its list and Save (statements spec §3.2-§3.4, plan checkpoint 3). Every
// test makes its own customer with a unique name and email and one posted invoice, opens the
// screen from that customer's New transaction menu (Customer balance "All", only that
// customer ticked), and reads what it stored through the page's own fetch.
//
// Not covered here (plan, "States with no e2e test"): a live change of the list, the
// no-write notice, the list's skeleton and load error, the "Saving…" state and a part
// failure; their pure helpers and the useCreateStatements harness test pin them. The phone
// cards and "Select all" row run in checkpoint 4's phone test.

// The same day of the month before, or that month's last day when it has no such day.
function dayOfMonthBefore(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number)
    const prevYear = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${prevYear}-${pad(prevMonth)}-${pad(Math.min(day, lastDay))}`
}

function savedToast(page: Page, text: string) {
    return page.getByTestId('toast-card').filter({ hasText: text })
}

function screenParts(page: Page, customer: StatementCustomer) {
    return {
        type: page.getByTestId('statements-type'),
        date: page.getByTestId('statements-date'),
        start: page.getByTestId('statements-start'),
        end: page.getByTestId('statements-end'),
        filter: page.getByTestId('statements-filter'),
        caption: page.getByTestId('statements-total-caption'),
        total: page.getByTestId('statements-total'),
        tickAll: page.getByTestId('statements-tick-all'),
        row: page.getByTestId(`statements-row-${customer.id}`),
        tick: page.getByTestId(`statements-tick-${customer.id}`),
        address: page.getByTestId(`statements-email-${customer.id}`),
        save: page.getByTestId('statements-save'),
        back: page.getByTestId('statements-back'),
    }
}

// After a Save: the toast, and the customer's page shown again.
async function expectSavedAndBack(page: Page, customer: StatementCustomer) {
    await expect(savedToast(page, '1 statement saved')).toBeVisible()
    await expect(page).toHaveURL(await customerPath(page, customer.id))
    await expect(page.getByTestId('customer-transactions')).toBeVisible()
}

async function selectAll(page: Page) {
    await page.keyboard.press('ControlOrMeta+a')
}

test.describe('statements: create', () => {
    test('keyboard-only create: focus on Statement type, ⌘S stores a Balance forward statement with the defaults', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)

        // From here on, no click.
        await expect(parts.type).toBeFocused()
        await expect(parts.row).toBeInViewport()
        await page.keyboard.press('ControlOrMeta+s')
        await expectSavedAndBack(page, customer)

        const today = await localDay(page, 0)
        const rows = await statementsOf(page, customer.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            type: 'balance_forward',
            statement_date: today,
            end_date: today,
            start_date: dayOfMonthBefore(today),
            email: customer.email,
            balance: customer.invoiceCents,
        })
        expect(rows[0].number).not.toBe('')
    })

    test('keyboard-only edit of the run: a statement date, a tick with Space and a typed address are saved', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)
        const yesterday = await localDay(page, -1)
        const typed = uniqueEmail('typed')

        // From here on, no click.
        await expect(parts.type).toBeFocused()
        await tabTo(page, parts.date, { max: 20 })
        await selectAll(page)
        await page.keyboard.type(yesterday)
        await expect(parts.date).toHaveValue(yesterday)

        // Options, the heading tick box, then each row's tick box and address.
        await tabTo(page, parts.tick, { max: 80 })
        await page.keyboard.press('Space')
        await expect(parts.caption).toHaveText('No customer selected')
        await page.keyboard.press('Space')
        await expect(parts.caption).toHaveText('Total balance of 1 customer')

        await tabTo(page, parts.address, { max: 3 })
        await selectAll(page)
        await page.keyboard.type(typed)
        await expect(parts.address).toHaveValue(typed)
        await page.keyboard.press('ControlOrMeta+s')
        await expectSavedAndBack(page, customer)

        const rows = await statementsOf(page, customer.id)
        expect(rows).toHaveLength(1)
        // End date followed Statement date: it was not typed in.
        expect(rows[0]).toMatchObject({
            statement_date: yesterday,
            end_date: yesterday,
            email: typed,
        })
        expect(await customerEmailOf(page, customer.id)).toBe(customer.email)
    })

    test('ticks, total and options: the total follows the ticks, a bad address is refused, Open items keeps the tick and the address', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)
        const today = await localDay(page, 0)
        // After the invoice's due date (30 days on), so the customer is overdue on it.
        const overdueDay = await localDay(page, 40)
        const typed = uniqueEmail('open-items')
        const overdueTyped = uniqueEmail('overdue')

        await expect(parts.caption).toHaveText('Total balance of 1 customer')
        await expect(parts.total).toHaveText(customer.invoiceAmount)

        await parts.tickAll.click()
        await parts.tickAll.click()
        await expect(parts.caption).toHaveText('No customer selected')
        await expect(parts.total).toHaveText('$0.00')
        await expect.poll(() => isDisabled(parts.save)).toBe(true)

        await parts.tick.click()
        await expect(parts.caption).toHaveText('Total balance of 1 customer')
        await expect(parts.total).toHaveText(customer.invoiceAmount)

        await parts.address.fill('x@')
        await page.keyboard.press('ControlOrMeta+s')
        const invalid = page
            .getByTestId('statements-create')
            .getByText('Enter a valid email address.', { exact: true })
        await expect(invalid).toBeVisible()
        await expect(page).toHaveURL(newStatementUrl(customer.id))
        expect(await statementsOf(page, customer.id)).toEqual([])

        await parts.address.fill(typed)
        await expect(invalid).toBeHidden()

        // End date typed in by keyboard stays when Statement date changes, also when the
        // typed day is the default one (spec §3.2: "When the user has not typed in End date").
        // Soft, so the steps below still run when it breaks.
        await parts.end.click()
        await selectAll(page)
        await page.keyboard.type(today)
        await expect(parts.end).toHaveValue(today)
        await parts.date.fill(overdueDay)
        await expect(parts.date).toHaveValue(overdueDay)
        await expect.soft(parts.end).toHaveValue(today)

        // Under Overdue (the invoice is due in 30 days, before the statement date) the
        // customer stays listed and ticked. A day edited key by key passes through a text
        // that is no day; the typed address and the tick stay, and the list never drops back
        // to its skeleton.
        await parts.filter.click()
        await page.getByTestId('statements-filter-overdue').click()
        await expect(parts.filter).toContainText('Overdue')
        await expect(parts.row).toBeVisible()
        await parts.address.fill(overdueTyped)
        await expect(parts.address).toHaveValue(overdueTyped)
        await page.evaluate(() => {
            const seen = { skeleton: false }
            Object.assign(window, { statementsSkeletonSeen: seen })
            new MutationObserver(() => {
                if (document.querySelector('[data-testid="statements-loading"]')) {
                    seen.skeleton = true
                }
            }).observe(document.body, { childList: true, subtree: true })
        })
        await parts.date.click()
        await page.keyboard.press('End')
        await page.keyboard.press('Backspace')
        await expect(parts.date).toHaveValue(overdueDay.slice(0, -1))
        await page.keyboard.type(overdueDay.slice(-1))
        await expect(parts.date).toHaveValue(overdueDay)
        await expect.soft(parts.address).toHaveValue(overdueTyped)
        await expect.soft(parts.caption).toHaveText('Total balance of 1 customer')
        expect
            .soft(
                await page.evaluate(
                    () =>
                        (window as unknown as { statementsSkeletonSeen: { skeleton: boolean } })
                            .statementsSkeletonSeen.skeleton
                )
            )
            .toBe(false)
        await parts.address.fill(typed)

        await parts.type.click()
        await page.getByTestId('statements-type-open_items').click()
        await expect(parts.type).toContainText('Open items')
        await expect(parts.start).toBeHidden()
        await expect(parts.end).toBeHidden()
        await expect(parts.caption).toHaveText('Total balance of 1 customer')
        await expect(parts.address).toHaveValue(typed)

        await parts.save.click()
        await expectSavedAndBack(page, customer)
        const rows = await statementsOf(page, customer.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            type: 'open_items',
            statement_date: overdueDay,
            start_date: '',
            end_date: '',
            email: typed,
        })
    })

    test('leave guard: Escape leaves an unchanged run at once, a changed one asks, Keep editing stays, Discard stores nothing', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const customer = await statementCustomer(page)
        await openNewStatementFor(page, customer)
        const parts = screenParts(page, customer)
        const dialog = page.getByTestId('discard-dialog')

        await expect(parts.type).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page).toHaveURL(await customerPath(page, customer.id))
        await expect(page.getByTestId('customer-transactions')).toBeVisible()
        await expect(dialog).toHaveCount(0)

        await openNewStatementFor(page, customer)
        await parts.tick.click()
        await expect(parts.caption).toHaveText('No customer selected')

        await page.keyboard.press('Escape')
        await expect(dialog).toBeVisible()
        await dialog.getByText('Keep editing', { exact: true }).click()
        await expect(dialog).toBeHidden()
        await expect(page).toHaveURL(newStatementUrl(customer.id))
        await expect(parts.caption).toHaveText('No customer selected')

        await parts.back.click()
        await expect(dialog).toBeVisible()
        await page.getByTestId('discard-confirm').click()
        await expect(page).toHaveURL(await customerPath(page, customer.id))
        await expect(page.getByTestId('customer-transactions')).toBeVisible()
        expect(await statementsOf(page, customer.id)).toEqual([])
    })
})
