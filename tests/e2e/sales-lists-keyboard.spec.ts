import { expect, type Page, test } from '@playwright/test'
import { createCustomer, DESKTOP, openBooks, uniqueName } from './customer-form-helpers'
import { NEW_INVOICE_URL } from './invoice-helpers'
import { openSales, postedInvoiceFor, salesRow, salesTabUrl } from './sales-lists-helpers'

// The Sales list keys (sales-lists checkpoint 5, spec §3 "Keyboard"): after the Sales
// screen opens, the test uses the keyboard only, except two mouse presses on a row (fix
// round 1): a press must leave no DOM focus on the row, so Enter and Space after it still
// reach the list's keys (at 1440 px in the names column, at 1280 px in the table). It presses every key of the list key map
// (`/`, J, ArrowDown, K, ArrowUp, Enter, O, X, Space, A, N, 1 to 6) and checks that each
// runs its own action, and that no list key runs while a document is pushed over the list.
// At 1440 px, beside an open invoice, the 320 px column moves with ArrowDown and ArrowUp
// and opens with Enter, while J stays the read view's View journal entry (checkpoint 5
// decision, 2026-11-17). The test makes its own customer and two posted invoices with one
// unique memo word, and finds them through the search field.
//
// Not covered by e2e (accepted, plan checkpoint 5):
// - the ⇧? list: the `listShortcuts` unit test covers the descriptions it shows;
// - the 50-row window growing: it needs 50+ documents and the screen's 12 tests are used;
//   the `mergeTransactions` and `documentListWindow` unit tests cover it, and
//   tests/e2e/list-paging.spec.ts is where a seeded case can go;
// - an inactive customer in the customer picker (the e2e uses a sub-customer);
// - the reader on a phone (gate 2, `read-only-phone-*`);
// - Download PDF from a row menu (the download leaves the page; the item's presence is
//   asserted);
// - the Android path (no list keys; every action has a visible control, asserted on the
//   phone runs).

const WIDE = { width: 1440, height: 900 }
const ENTRY_URL = /\/books\/entries\/[a-z0-9]{15}$/

function visible(page: Page, testId: string) {
    return page.getByTestId(testId).filter({ visible: true })
}

function listRows(page: Page) {
    return page.getByTestId(/^sales-row-[a-z0-9]{15}$/).filter({ visible: true })
}

// The ids of the visible rows, in list order, read in one snapshot.
function rowIdsInOrder(page: Page): Promise<string[]> {
    return listRows(page).evaluateAll(rows =>
        rows.map(row => (row.getAttribute('data-testid') ?? '').replace(/^sales-row-/, ''))
    )
}

// A key that a shortcut handles runs in its keydown handler; two frames later its
// navigation or render has landed, so an unchanged state after this is a real no-op.
function settled(page: Page): Promise<void> {
    return page.evaluate(
        () =>
            new Promise<void>(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
    )
}

async function pressTab(page: Page, key: string, tabKey: string) {
    await page.keyboard.press(key)
    await expect(page).toHaveURL(salesTabUrl(tabKey))
    await expect(visible(page, `sales-tab-${tabKey}`)).toHaveAttribute('aria-selected', 'true')
}

async function expectFocusedRow(page: Page, focused: string, other: string) {
    await expect(salesRow(page, focused)).toHaveAttribute('aria-current', 'true')
    await expect(salesRow(page, other)).not.toHaveAttribute('aria-current', 'true')
}

async function expectTicked(page: Page, id: string, ticked: boolean) {
    await expect(visible(page, `sales-tick-${id}`)).toHaveAttribute(
        'aria-checked',
        ticked ? 'true' : 'false'
    )
}

test.describe('sales-lists: keyboard', () => {
    test('every list key runs its action, and none runs under a pushed invoice', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const name = uniqueName('Sales keys')
        await createCustomer(page, { name })
        const word = `Keys${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
        await postedInvoiceFor(page, name, word)
        await postedInvoiceFor(page, name, word)

        await openSales(page)

        // 3, 4, 5, 6, 7 and 1 switch tabs; 2 goes to Invoices.
        await pressTab(page, '3', 'estimates')
        await pressTab(page, '4', 'sales-receipts')
        await pressTab(page, '5', 'payments')
        await pressTab(page, '6', 'credit-memos')
        await pressTab(page, '7', 'refund-receipts')
        await pressTab(page, '1', 'all')
        await pressTab(page, '2', 'invoices')

        // / focuses the search field; the typed word leaves the two invoices.
        const search = visible(page, 'sales-search')
        await page.keyboard.press('/')
        await expect(search).toBeFocused()
        await page.keyboard.type(word)
        await expect(search).toHaveValue(word)
        await expect(listRows(page)).toHaveCount(2)
        const [first, second] = await rowIdsInOrder(page)
        if (first === undefined || second === undefined) throw new Error('two rows not listed')

        // Escape leaves the field and keeps its text.
        await page.keyboard.press('Escape')
        await expect(search).not.toBeFocused()
        await expect(search).toHaveValue(word)

        // J and K move the row focus; ArrowDown and ArrowUp move it the same way.
        await page.keyboard.press('j')
        await expectFocusedRow(page, first, second)
        await page.keyboard.press('j')
        await expectFocusedRow(page, second, first)
        await page.keyboard.press('k')
        await expectFocusedRow(page, first, second)
        await page.keyboard.press('ArrowDown')
        await expectFocusedRow(page, second, first)
        await page.keyboard.press('ArrowUp')
        await expectFocusedRow(page, first, second)

        // X ticks the focused row and Space clears it.
        await page.keyboard.press('x')
        await expectTicked(page, first, true)
        await expectTicked(page, second, false)
        await page.keyboard.press('Space')
        await expectTicked(page, first, false)
        await expect(page).toHaveURL(salesTabUrl('invoices'))

        // A ticks both loaded rows and A again clears both.
        await page.keyboard.press('a')
        await expectTicked(page, first, true)
        await expectTicked(page, second, true)
        await page.keyboard.press('a')
        await expectTicked(page, first, false)
        await expectTicked(page, second, false)

        // Enter opens the focused invoice.
        const firstUrl = new RegExp(`/books/invoices/${first}$`)
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(firstUrl)
        await expect(visible(page, 'invoice-read-only')).toBeVisible()

        // The list under the pushed invoice has no keys: ArrowDown and 3 do nothing. (J is
        // not pressed here: the read view owns J, View journal entry. 3 is another tab's
        // key: the current tab's key would be a no-op even if it leaked.)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('3')
        await settled(page)
        expect(page.url()).toMatch(firstUrl)

        // Back on the list the focus is where it was, and O opens the focused invoice again.
        await page.goBack()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expectFocusedRow(page, first, second)
        await page.keyboard.press('o')
        await expect(page).toHaveURL(firstUrl)

        // At 1440 px the invoice opens beside the 320 px column, whose list keys stay active
        // under the read view: ArrowDown and ArrowUp move the row focus there.
        await page.setViewportSize(WIDE)
        const column = visible(page, 'sales-names')
        await expect(column).toBeVisible()
        const secondName = column.getByTestId(`sales-name-row-${second}`)
        await expect(secondName).toBeVisible()
        await expect(secondName).not.toHaveAttribute('aria-current', 'true')
        await page.keyboard.press('ArrowDown')
        await expect(secondName).toHaveAttribute('aria-current', 'true')
        await page.keyboard.press('ArrowUp')
        await expect(secondName).not.toHaveAttribute('aria-current', 'true')
        expect(page.url()).toMatch(firstUrl)

        // ArrowDown and Enter open the second invoice beside the column.
        await page.keyboard.press('ArrowDown')
        await expect(secondName).toHaveAttribute('aria-current', 'true')
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${second}$`))
        await expect(visible(page, 'invoice-read-only')).toBeVisible()
        await expect(secondName).toHaveAttribute('aria-current', 'true')

        // A mouse press on a name row opens it beside and leaves the keys to the list: after
        // a click on the first name row, ArrowDown and Enter open the second invoice (Enter
        // must not press the clicked row again).
        const firstName = column.getByTestId(`sales-name-row-${first}`)
        await firstName.click()
        await expect(page).toHaveURL(firstUrl)
        await expect(firstName).toHaveAttribute('aria-current', 'true')
        await page.keyboard.press('ArrowDown')
        await expect(secondName).toHaveAttribute('aria-current', 'true')
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(new RegExp(`/books/invoices/${second}$`))
        await expect(visible(page, 'invoice-read-only')).toBeVisible()
        await expect(secondName).toHaveAttribute('aria-current', 'true')
        await expect(firstName).not.toHaveAttribute('aria-current', 'true')

        // J is the read view's View journal entry there, not a list move.
        await page.keyboard.press('j')
        await expect(page).toHaveURL(ENTRY_URL)

        // One record at a time in the child stack: the second invoice replaced the first and
        // the journal entry replaced the second, so one Back reaches the list.
        await page.goBack()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await page.setViewportSize(DESKTOP)
        await expect(visible(page, 'sales-list')).toBeVisible()

        // At 1280 px a mouse press on a row opens it; back on the list, J moves the row
        // focus from the pressed row and Space ticks the newly focused row (it does not
        // open the pressed row's invoice). Space again clears it.
        await salesRow(page, first).click()
        await expect(page).toHaveURL(firstUrl)
        await page.goBack()
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await expectFocusedRow(page, first, second)
        await page.keyboard.press('j')
        await expectFocusedRow(page, second, first)
        await page.keyboard.press('Space')
        await expectTicked(page, second, true)
        await expectTicked(page, first, false)
        await expect(page).toHaveURL(salesTabUrl('invoices'))
        await page.keyboard.press('Space')
        await expectTicked(page, second, false)
        await expect(page).toHaveURL(salesTabUrl('invoices'))

        // On All sales N opens the New menu; Escape closes it.
        await pressTab(page, '1', 'all')
        await page.keyboard.press('n')
        await expect(page.getByTestId('sales-new-estimate')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('sales-new-estimate')).toBeHidden()
        await expect(page).toHaveURL(salesTabUrl('all'))

        // On Invoices N opens a new invoice with the focus in its first field.
        await pressTab(page, '2', 'invoices')
        await page.keyboard.press('n')
        await expect(page).toHaveURL(NEW_INVOICE_URL)
        await expect(page.getByTestId('form-input-customer')).toBeFocused()
    })
})
