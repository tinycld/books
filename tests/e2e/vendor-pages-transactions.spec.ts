import { expect, type Page, type Route, test } from '@playwright/test'
import { isPhone, showListsHub } from './account-register-helpers'
import {
    BILL_URL,
    billCellTestId,
    billIdFromUrl,
    billLineRowId,
    pickLineAccount,
    postBill,
} from './bill-helpers'
import {
    EXPENSE_URL,
    expenseCellTestId,
    expenseIdFromUrl,
    openNewExpense,
    pickExpenseLineAccount,
    pickExpenseVendor,
    pickPaidFrom,
    postExpense,
} from './expense-helpers'
import { uniqueMemo } from './invoice-helpers'
import {
    BILL_EXPENSE_ACCOUNT,
    CHECKING,
    localDay,
    payBillsRowAmount,
    pickSelect,
    postedNumber,
    vendorWithBills,
} from './pay-bills-helpers'
import { holdLoads } from './record-form-helpers'
import { expectRecordUrl } from './record-key-helpers'
import {
    creditCellTestId,
    pickCreditLineAccount,
    VENDOR_CREDIT_URL,
    vendorCreditIdFromUrl,
} from './vendor-credit-helpers'
import {
    createVendor,
    DESKTOP,
    discardDialog,
    field,
    openBooks,
    openNewVendor,
    openVendorId,
    openVendorsList,
    searchVendors,
    uniqueName,
    vendorEntry,
    vendorPath,
} from './vendor-form-helpers'
import {
    REFUND_CREDIT_ACCOUNT,
    refundCell,
    shownRefund,
    VENDOR_REFUND_URL,
    vendorRefundIdFromUrl,
} from './vendor-refund-helpers'

// The vendor page's Transactions tab (vendor-pages checkpoint 4, spec §3.5 and §3.7): one
// list of the vendor's bills, expenses, bill payments, vendor credits and vendor refunds,
// its type chips, its states, and opening a document from a row. Every test, or serial group
// of tests, creates its own vendors with unique names; every document is made through its
// form, dated on or after 2026-07-01. No seeded row is changed.
//
// Not covered here: a read-only user (no New transaction in the empty state) cannot be
// driven, because the e2e seed has no read-only Books member (as
// customer-form-actions.spec.ts says); the reader rules are pinned by the
// `vendorPageControls` unit test and the `canWrite` flag of the shared parts. The window
// growing by 50 needs 50+ documents of one vendor; the pure `mergeTransactions` unit test
// (tests/vendor-transactions.test.ts) covers `hasMore` and the cut to n.

const BILLS_URL = '**/api/collections/books_bills/records**'
const EXPENSES_URL = '**/api/collections/books_expenses/records**'
const ROW_ID = /^vendor-transaction-([a-z0-9]{15})$/
// U+2212, the sign a negative total is written with.
const MINUS = '−'
const NO_DUE_DATE = '—'

// The window at which the vendor page sits beside the names column (the record surface),
// and a width that is not a phone.
const RECORD_SURFACE = { width: 1360, height: 900 }
const NARROW = { width: 800, height: 900 }

type RowSnapshot = { id: string; cells: string[] }

// The table's rows in screen order with their cells' text (Date, Type, No., Due date,
// Total, Status), in one snapshot.
function tableRows(page: Page): Promise<RowSnapshot[]> {
    return page
        .getByTestId('vendor-transactions')
        .locator('[data-testid^="vendor-transaction-"]')
        .evaluateAll((els, pattern) => {
            const rows: { id: string; cells: string[] }[] = []
            for (const el of els) {
                const match = new RegExp(pattern).exec(el.getAttribute('data-testid') ?? '')
                if (!match?.[1] || rows.some(r => r.id === match[1])) continue
                const cells = Array.from(el.children).map(c => (c.textContent ?? '').trim())
                rows.push({ id: match[1], cells })
            }
            return rows
        }, ROW_ID.source)
}

async function transactionIds(page: Page) {
    return (await tableRows(page)).map(r => r.id)
}

function transaction(page: Page, id: string) {
    return page.getByTestId(`vendor-transaction-${id}`)
}

// One read of the DOM that never waits for an element: the list swaps its table for cards
// on a later layout, so a locator read could wait for a table that has unmounted.
function readListWidth(page: Page) {
    return page.evaluate(() => {
        const shown = (id: string) => {
            const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
            return el !== null && el.getClientRects().length > 0 ? el : null
        }
        const table = shown('vendor-transactions-table')
        return {
            cards: shown('vendor-transactions-cards') !== null,
            tableFits: table !== null && table.scrollWidth <= table.clientWidth,
        }
    })
}

// True when the list shows cards, or a table whose own scroller does not reach past its
// box (no sideways scroll).
async function listFitsItsWidth(page: Page) {
    const list = await readListWidth(page)
    return list.cards || list.tableFits
}

async function tableFitsItsWidth(page: Page) {
    return (await readListWidth(page)).tableFits
}

function refusal(route: Route) {
    return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ status: 400, message: 'Something went wrong.', data: {} }),
    })
}

function refusedResponse(page: Page, collection: string) {
    return page.waitForResponse(
        r => r.url().includes(`/api/collections/${collection}/records`) && r.status() === 400
    )
}

// From anywhere in Books (a document pushed over Journal Entries too): the Lists tab, then
// the vendor's row opens its page. The Lists tab keeps its own stack, so openVendorsList
// leaves a vendor page left on it.
async function openFromRow(page: Page, name: string) {
    const listsTab = page
        .getByTestId('books-list-card-vendors')
        .or(page.getByTestId('vendors-list'))
        .or(page.getByTestId('vendor-back'))
        .filter({ visible: true })
    if ((await listsTab.count()) === 0) {
        // A phone has the Lists entry only in the Books menu (the drawer).
        if (isPhone(page)) await showListsHub(page)
        else await page.getByTestId('books-nav-lists').click()
        await expect(listsTab.first()).toBeVisible()
    }
    await openVendorsList(page)
    await searchVendors(page, name)
    await vendorEntry(page, name).click()
    await expect(page.getByTestId('vendor-title')).toHaveText(name)
}

// Back from a pushed document to the vendor page kept under it, on its Transactions tab.
async function backToVendor(page: Page, id: string) {
    await page.goBack()
    await expect(page).toHaveURL(vendorPath(id))
    await expect(page.getByTestId('vendor-transactions')).toBeVisible()
}

// The header's New transaction menu → one item.
async function chooseNew(page: Page, item: string) {
    await page.getByTestId('vendor-new-transaction').click()
    await page.getByTestId(item).click()
}

// The bill form opened for this vendor: one account line at `amount`, due `due`.
async function fillBill(page: Page, input: { amount: string; due: string }) {
    await page.getByTestId('form-input-due_date').fill(input.due)
    await pickLineAccount(page, 0, BILL_EXPENSE_ACCOUNT)
    const line = await billLineRowId(page, 'account_lines', 0)
    await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill(input.amount)
}

// The cell of one row by its column: 0 Date, 1 Type, 2 No., 3 Due date, 4 Total, 5 Status.
function cell(rows: RowSnapshot[], id: string, column: number) {
    const row = rows.find(r => r.id === id)
    if (!row) throw new Error(`no row ${id}`)
    return row.cells[column] ?? ''
}

test.describe('vendor-pages: vendor transactions', () => {
    // One vendor with a document of every kind, made through the forms once and read by the
    // tests after it: making all seven in one test took most of a test's budget on CI. The
    // tests share one page and run in order; a failure skips the rest of the group.
    test.describe('one vendor with every kind of document', () => {
        test.describe.configure({ mode: 'serial' })

        let page: Page
        const docs = {
            vendorId: '',
            vendorName: '',
            pastDue: '',
            later: '',
            expense: '',
            draft: '',
            payment: '',
            credit: '',
            refund: '',
        }

        test.beforeAll(async ({ browser }) => {
            const context = await browser.newContext()
            page = await context.newPage()
        })

        test.afterAll(async () => {
            await page?.context().close()
        })

        test('a vendor with a posted past-due bill and a posted bill due later', async () => {
            await openBooks(page, DESKTOP)
            const { vendor, bills } = await vendorWithBills(page, {
                name: uniqueName('Vendor transactions'),
                bills: [
                    { amount: '300.00', due: await localDay(page, -10) },
                    { amount: '200.00', due: await localDay(page, 20) },
                ],
            })
            const [pastDue, later] = bills
            docs.vendorId = vendor.id
            docs.vendorName = vendor.name
            docs.pastDue = pastDue.id
            docs.later = later.id
        })

        test('a posted expense from the New menu and a draft bill from the page', async () => {
            const id = docs.vendorId
            const today = await localDay(page, 0)

            // A posted expense, from the New menu over Journal Entries.
            await openNewExpense(page)
            await pickExpenseVendor(page, docs.vendorName)
            await pickPaidFrom(page, CHECKING)
            const expenseLine = await pickExpenseLineAccount(page, 0, BILL_EXPENSE_ACCOUNT)
            await page
                .getByTestId(expenseCellTestId('account_lines', expenseLine, 'amount'))
                .fill('45.00')
            await page
                .getByTestId('form-input-memo')
                .fill(uniqueMemo('Vendor transactions expense'))
            await postExpense(page)
            await expect(page).toHaveURL(EXPENSE_URL)
            docs.expense = await expenseIdFromUrl(page)

            // A draft bill, from the page's menu.
            await openFromRow(page, docs.vendorName)
            await chooseNew(page, 'vendor-new-bill')
            await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?vendor=${id}$`))
            await fillBill(page, { amount: '75.00', due: today })
            await page.getByTestId('bill-save-draft').click()
            await expect(page).toHaveURL(BILL_URL)
            await expect(page.getByTestId('bill-title')).toHaveText('Draft bill')
            docs.draft = await billIdFromUrl(page)
            await backToVendor(page, id)
        })

        test('a bill payment, a vendor credit and a refund on it, from the page', async () => {
            const id = docs.vendorId

            // A bill payment of $50.00 on the later bill: Pay bills returns to the page.
            await chooseNew(page, 'vendor-new-pay-bills')
            await expect(page).toHaveURL(new RegExp(`/books/pay-bills\\?vendor=${id}$`))
            await expect(page.getByTestId('pay-bills-title')).toHaveText('Pay bills')
            await payBillsRowAmount(page, docs.later).fill('50.00')
            await pickSelect(page, 'pay-bills-paid-from', CHECKING)
            await page.getByTestId('pay-bills-pay').click()
            await postedNumber(page)
            await expect(page).toHaveURL(vendorPath(id))
            await expect(page.getByTestId('vendor-transactions')).toBeVisible()

            // A posted vendor credit of $80.00, from the page's menu.
            await chooseNew(page, 'vendor-new-vendor-credit')
            await expect(page).toHaveURL(new RegExp(`/books/vendor-credits/new\\?vendor=${id}$`))
            const creditLine = await pickCreditLineAccount(page, 0, REFUND_CREDIT_ACCOUNT)
            await page
                .getByTestId(creditCellTestId('account_lines', creditLine, 'amount'))
                .fill('80.00')
            await page.getByTestId('form-input-memo').fill(uniqueMemo('Vendor transactions credit'))
            await page.getByTestId('vendor-credit-post').click()
            await expect(page).toHaveURL(VENDOR_CREDIT_URL)
            await expect(page.getByTestId('vendor-credit-read-only')).toBeVisible()
            docs.credit = await vendorCreditIdFromUrl(page)
            await backToVendor(page, id)

            // A refund of $30.00 on it, from the page's menu: $50.00 of the credit stays
            // unapplied. Not through postRefundOn: it opens New over the Journal Entries list,
            // which the expense above left lower in the one Books stack, so its nav press
            // would push a second entries list.
            await chooseNew(page, 'vendor-new-vendor-refund')
            await expect(page).toHaveURL(new RegExp(`/books/vendor-refunds/new\\?vendor=${id}$`))
            await page.getByTestId('vendor-refund-amount').fill('30.00')
            await expect(refundCell(page, docs.credit)).toHaveValue('30.00')
            await page
                .getByTestId('vendor-refund-memo')
                .fill(uniqueMemo('Vendor transactions refund'))
            await page.getByTestId('vendor-refund-post').click()
            await expect(page).toHaveURL(VENDOR_REFUND_URL)
            await expect(shownRefund(page, 'vendor-refund-read-only')).toBeVisible()
            docs.refund = await vendorRefundIdFromUrl(page)
            await backToVendor(page, id)
        })

        test("lists the vendor's documents newest first with their type, due date, total and status", async () => {
            const { pastDue, later, draft, expense, credit, refund } = docs

            // Newest first: the past-due bill is the only one dated before today, and the
            // others, all dated today, follow their creation, newest first.
            await expect(page.getByTestId('vendor-transactions-table')).toBeVisible()
            await expect.poll(async () => (await tableRows(page)).length).toBe(7)
            const rows = await tableRows(page)
            const paymentRow = rows.find(r => r.cells[1] === 'Bill payment')
            if (!paymentRow) throw new Error('no bill payment row')
            const payment = paymentRow.id
            docs.payment = payment
            expect(rows.map(r => r.id)).toEqual([
                refund,
                credit,
                payment,
                draft,
                expense,
                later,
                pastDue,
            ])
            const days = rows.map(r => Date.parse(r.cells[0]))
            for (const day of days) expect(Number.isNaN(day)).toBe(false)
            for (let i = 1; i < days.length; i++) {
                expect(days[i - 1]).toBeGreaterThanOrEqual(days[i])
            }
            expect(days[days.length - 2]).toBeGreaterThan(days[days.length - 1])

            // Type, Due date, Total sign and Status of each row.
            const types: [string, string][] = [
                [pastDue, 'Bill'],
                [later, 'Bill'],
                [draft, 'Bill'],
                [payment, 'Bill payment'],
                [expense, 'Expense'],
                [credit, 'Vendor credit'],
                [refund, 'Vendor refund'],
            ]
            for (const [rowId, type] of types) expect(cell(rows, rowId, 1), rowId).toBe(type)
            for (const rowId of [pastDue, later, draft]) {
                expect(Number.isNaN(Date.parse(cell(rows, rowId, 3))), rowId).toBe(false)
            }
            for (const rowId of [payment, expense, credit, refund]) {
                expect(cell(rows, rowId, 3), rowId).toBe(NO_DUE_DATE)
            }
            expect(cell(rows, credit, 4).startsWith(MINUS)).toBe(true)
            for (const rowId of [pastDue, later, draft, payment, expense, refund]) {
                expect(cell(rows, rowId, 4).startsWith(MINUS), rowId).toBe(false)
            }
            const statuses: [string, string][] = [
                [pastDue, 'Overdue'],
                [later, 'Partly paid'],
                [draft, 'Draft'],
                [payment, 'Paid'],
                [expense, 'Paid'],
                [credit, 'Unapplied'],
                [refund, 'Received'],
            ]
            for (const [rowId, status] of statuses) {
                expect(cell(rows, rowId, 5), rowId).toBe(status)
            }
        })

        test('filters by type, and All keeps the shown rows while it reloads', async () => {
            // The chips filter by kind.
            await page.getByTestId('vendor-transactions-filter-bill-payment').click()
            await expect.poll(() => transactionIds(page)).toEqual([docs.payment])
            await page.getByTestId('vendor-transactions-filter-vendor-refund').click()
            await expect.poll(() => transactionIds(page)).toEqual([docs.refund])

            // All after a single-kind chip: the chip released the expenses query, so All
            // starts a fresh expenses read. While that read is held, the rows already shown
            // stay, with no Loading in their place (keepRows keyed by the vendor, not the
            // chip).
            const heldExpenses = await holdLoads(page, EXPENSES_URL)
            await page.getByTestId('vendor-transactions-filter-all').click()
            await expect.poll(() => heldExpenses.held.length).toBeGreaterThan(0)
            await expect(page.getByTestId('vendor-transactions-loading')).toHaveCount(0)
            await expect(transaction(page, docs.refund)).toBeVisible()
            await heldExpenses.release()
            await expect.poll(() => transactionIds(page)).toHaveLength(7)
        })

        test('a row opens its document, with typed notes kept, and holds no button', async () => {
            const id = docs.vendorId
            const notesInput = page.getByTestId('vendor-notes-input')
            const saveBar = page.getByTestId('vendor-save-bar')

            // Notes typed: a row opens its document with no leave question; Back keeps them.
            const note = `${docs.vendorName} note`
            await page.keyboard.press('Alt+4')
            await notesInput.click()
            await page.keyboard.type(note)
            await expect(saveBar).toBeVisible()
            await page.keyboard.press('Alt+1')
            await expect(page.getByTestId('vendor-transactions-table')).toBeVisible()
            await transaction(page, docs.pastDue).click()
            await expectRecordUrl(page, 'bills', docs.pastDue)
            await expect(discardDialog(page).title).toHaveCount(0)
            await backToVendor(page, id)
            await expect(saveBar).toBeVisible()
            await page.keyboard.press('Alt+4')
            await expect(notesInput).toHaveValue(note)
            await page.keyboard.press('Alt+1')

            // Every other kind opens its own route.
            for (const [rowId, route] of [
                [docs.payment, 'bill-payments'],
                [docs.refund, 'vendor-refunds'],
                [docs.expense, 'expenses'],
                [docs.credit, 'vendor-credits'],
            ] as const) {
                await transaction(page, rowId).click()
                await expectRecordUrl(page, route, rowId)
                await backToVendor(page, id)
            }

            // A row holds no button or menu of its own.
            for (const rowId of [docs.pastDue, docs.payment, docs.credit]) {
                await expect(transaction(page, rowId).locator('[role="button"]')).toHaveCount(0)
            }
        })

        test("the list's own width decides: never a sideways scroll", async () => {
            await page.setViewportSize(NARROW)
            await expect(transaction(page, docs.pastDue)).toBeVisible()
            await expect.poll(() => listFitsItsWidth(page)).toBe(true)
            await page.setViewportSize(RECORD_SURFACE)
            await expect(page.getByTestId('vendor-transactions-table')).toBeVisible()
            await expect.poll(() => tableFitsItsWidth(page)).toBe(true)
        })
    })

    test('void and corrected documents, the empty states, loading and the error', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const prefix = uniqueName('Vendor transaction states')
        const emptyName = `${prefix} empty`
        const loadingName = `${prefix} loading`
        const failingName = `${prefix} failing`
        const today = await localDay(page, 0)

        // Three vendors saved with Save and new: none of their pages has read anything.
        await openNewVendor(page)
        for (const name of [emptyName, loadingName, failingName]) {
            await field(page, 'display_name').fill(name)
            await page.getByTestId('vendor-save-new').click()
            await expect(field(page, 'display_name')).toHaveValue('')
            await expect(page.getByTestId('vendor-title')).toHaveText('New vendor')
        }

        // A vendor with a plain void bill and a corrected bill.
        await createVendor(page, { name: `${prefix} void` })
        const id = await openVendorId(page)
        await chooseNew(page, 'vendor-new-bill')
        await fillBill(page, { amount: '60.00', due: today })
        await postBill(page)
        const voidId = await billIdFromUrl(page)
        await page.getByTestId('bill-read-void').click()
        await page.getByTestId('void-confirm').click()
        await expect(page.getByTestId('bill-badge')).toHaveText('Void')
        await backToVendor(page, id)

        await chooseNew(page, 'vendor-new-bill')
        await fillBill(page, { amount: '90.00', due: today })
        const number = await postBill(page)
        const originalId = await billIdFromUrl(page)
        await page.keyboard.press('e')
        await expect(page).toHaveURL(new RegExp(`/books/bills/new\\?replaces=${originalId}$`))
        await expect(page.getByTestId('bill-title')).toHaveText(`Edit ${number}`)
        const line = await billLineRowId(page, 'account_lines', 0)
        await page.getByTestId(billCellTestId('account_lines', line, 'amount')).fill('95.00')
        await page.getByTestId('bill-post').click()
        await expect(page).toHaveURL(BILL_URL)
        expect(await billIdFromUrl(page)).not.toBe(originalId)
        await expect(page.getByTestId('bill-title')).toHaveText(`Bill ${number}`)
        const correctionId = await billIdFromUrl(page)
        await backToVendor(page, id)

        // The plain void stays with Void; the replaced original is left out.
        await expect.poll(() => transactionIds(page)).toEqual([correctionId, voidId])
        await expect(transaction(page, voidId)).toContainText('Void')
        await expect(transaction(page, originalId)).toHaveCount(0)
        await expect(transaction(page, correctionId)).toContainText(number)

        // No expense: the Expenses chip's sentence, and Show all.
        await page.getByTestId('vendor-transactions-filter-expense').click()
        await expect(page.getByTestId('vendor-transactions-no-match')).toHaveText(
            'No expenses for this vendor'
        )
        await page.getByTestId('vendor-transactions-show-all').click()
        await expect(page.getByTestId('vendor-transactions-no-match')).toHaveCount(0)
        await expect(page.getByTestId('vendor-transactions-filter-all')).toHaveAttribute(
            'aria-pressed',
            'true'
        )
        await expect.poll(() => transactionIds(page)).toEqual([correctionId, voidId])

        // A vendor with no documents: the empty state's button opens the header's menu.
        await openFromRow(page, emptyName)
        await expect(page.getByTestId('vendor-transactions-empty')).toContainText(
            'No transactions for this vendor yet'
        )
        await page.getByTestId('vendor-transactions-empty-new').click()
        await expect(page.getByTestId('vendor-new-bill')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('vendor-new-bill')).toHaveCount(0)

        // The bills read held before the page opens: Loading until released.
        await openVendorsList(page)
        await searchVendors(page, loadingName)
        const bills = await holdLoads(page, BILLS_URL)
        await vendorEntry(page, loadingName).click()
        await expect(page.getByTestId('vendor-title')).toHaveText(loadingName)
        await expect.poll(() => bills.held.length).toBeGreaterThan(0)
        await expect(page.getByTestId('vendor-transactions-loading')).toBeVisible()
        // A chip other than All runs only its kind's query: with the bills read still held,
        // the Expenses chip shows its sentence and no Loading (a hook that ran all five reads
        // under the chip would wait for the held bills read).
        await page.getByTestId('vendor-transactions-filter-expense').click()
        await expect(page.getByTestId('vendor-transactions-no-match')).toHaveText(
            'No expenses for this vendor'
        )
        await expect(page.getByTestId('vendor-transactions-loading')).toHaveCount(0)
        expect(bills.held.length).toBeGreaterThan(0)
        // Back to All with the bills read held again: the empty kept list of the Expenses
        // chip is not a final state, so Loading shows and the empty state does not.
        await page.getByTestId('vendor-transactions-filter-all').click()
        await expect(page.getByTestId('vendor-transactions-loading')).toBeVisible()
        await expect(page.getByTestId('vendor-transactions-empty')).toHaveCount(0)
        await bills.release()
        await expect(page.getByTestId('vendor-transactions-loading')).toHaveCount(0)
        await expect(page.getByTestId('vendor-transactions-empty')).toBeVisible()

        // The expenses read refused on its first load: the banner, then Retry.
        await openVendorsList(page)
        await searchVendors(page, failingName)
        await page.route(EXPENSES_URL, refusal)
        const failed = refusedResponse(page, 'books_expenses')
        await vendorEntry(page, failingName).click()
        await expect(page.getByTestId('vendor-title')).toHaveText(failingName)
        await failed
        await expect(page.getByTestId('vendor-transactions-banner')).toBeVisible()
        await page.unrouteAll({ behavior: 'wait' })
        await page.getByTestId('vendor-transactions-retry').click()
        await expect(page.getByTestId('vendor-transactions-banner')).toHaveCount(0)
        await expect(page.getByTestId('vendor-transactions-empty')).toContainText(
            'No transactions for this vendor yet'
        )
    })
})
