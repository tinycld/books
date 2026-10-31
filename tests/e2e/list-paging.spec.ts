import { expect, type Page, test } from '@playwright/test'
import { PARTY_ROW_HEIGHT } from '../../tinycld/books/lib/party-list'
import {
    customerEntry,
    expectEntriesInOrder,
    openCustomersList,
    searchCustomers,
} from './customer-form-helpers'
import { openProductsList, productEntry, searchProducts } from './products-services-helpers'
import { DESKTOP, openBooks, PHONE, textLeft, textTop } from './record-form-helpers'
import { deleteSeeded, runStamp, type Seeded, superuserClient } from './superuser-seed'
import { openVendorsList, searchVendors, vendorEntries, vendorEntry } from './vendor-form-helpers'

// Books lists page from the server: a list asks PocketBase for one page (50 rows and one
// to look ahead), sorted and filtered there, and asks for the next page, by a cursor on
// sort_key, only when the person scrolls near its end. Search, Show inactive, the sort
// and scrolling to load more are driven through the UI against the real server.
//
// SEEDED BY A SUPERUSER WRITE. Each describe seeds about 60 rows with a superuser
// client (superuser-seed.ts). This extends the CLAUDE.md seed exception; the human
// approved it for this spec only (2026-10-31). Why: paging needs more rows than one
// page, and creating 50 or more records through the New form takes minutes per list
// on every run. What this therefore does NOT cover: record creation. No row here is
// created through the form, so read this spec as coverage of listing, searching,
// filtering, sorting and paging existing records only; the customer, vendor and
// products form specs cover creation.
//
// ISOLATION. Every seeded name holds a word unique to the run (`runStamp`) and starts
// with "Zz Paging", so it sorts after the fixtures other specs read at the top of a
// list. Each test searches for the run's word, so rows other specs add never enter its
// pages, and afterAll deletes every seeded row. The requests are only watched
// (`page.on('request')`), never answered or changed.

const two = (n: number) => String(n).padStart(2, '0')

// The names that hold every piece, ignoring case: what a search cut into `pieces` finds.
const holdingAll = (names: readonly string[], pieces: readonly string[]) =>
    names.filter(name => pieces.every(piece => name.toLowerCase().includes(piece.toLowerCase())))

// Taller than a first page of 50 rows, so the table has nothing to scroll.
const TALL_DESKTOP = { width: 1280, height: 3000 }

// Keeps the URL of every list request the page sends for `collection`.
function watchListRequests(page: Page, collection: string): URL[] {
    const seen: URL[] = []
    page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname === `/api/collections/${collection}/records`) seen.push(url)
    })
    return seen
}

const filterOf = (url: URL | undefined) => url?.searchParams.get('filter') ?? ''
const isCursor = (url: URL) => filterOf(url).includes('sort_key >')
const isListPage = (url: URL) => url.searchParams.get('sort') === 'sort_key,id'
const textFilter = (term: string) =>
    `display_name ~ "%${term}%" || company ~ "%${term}%" || email ~ "%${term}%" || phone ~ "%${term}%"`

// The first page's request for a search: sorted, no cursor, filtered on the term. The list
// sends it after a pause in typing, and the rows already on screen can hold the row a step
// waits for, so this waits for the request itself.
async function searchRequest(seen: readonly URL[], term: string) {
    const find = () =>
        seen.find(url => isListPage(url) && !isCursor(url) && filterOf(url).includes(term))
    await expect.poll(() => find() !== undefined).toBe(true)
    return find()
}

async function scrollToEnd(page: Page, testId: string) {
    await page.getByTestId(testId).evaluate(el => {
        el.scrollTop = el.scrollHeight
    })
}

async function scrollToRow(page: Page, testId: string, index: number) {
    await page.getByTestId(testId).evaluate((el, top) => {
        el.scrollTop = top
    }, index * PARTY_ROW_HEIGHT)
}

test.describe('vendors list pages from the server', () => {
    const stamp = runStamp()
    const seeded: Seeded[] = []
    const vendor = (label: string) => `Zz Paging ${stamp} ${label}`
    const lowerFable = `zz paging ${stamp} fable`
    // The names a search with Show inactive off can find.
    const activeNames: string[] = []

    test.beforeAll(async () => {
        const pb = await superuserClient()
        const create = async (display_name: string, inactive = false) => {
            const row = await pb.collection('books_vendors').create({ display_name, inactive })
            seeded.push({ collection: 'books_vendors', id: row.id })
            if (!inactive) activeNames.push(display_name)
        }
        // Created in reverse order, so the order the list shows is the server's sort.
        for (let n = 57; n >= 1; n--) await create(vendor(`Vendor ${two(n)}`))
        // The sort folds case and accents: Eagle, Écho, fable, then the Vendor rows.
        await create(lowerFable)
        await create(vendor('Écho'))
        await create(vendor('Eagle'))
        await create(vendor('Vendor 99'), true)
    })

    test.afterAll(async () => {
        await deleteSeeded(await superuserClient(), seeded)
    })

    test('a page at a time; search, sort and Show inactive on the server (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const seen = watchListRequests(page, 'books_vendors')
        await openVendorsList(page)

        // (1) The search is a request filter (`~` on every text column, active rows only)
        //     for one page of 50 and a row to look ahead, sorted by the server.
        await searchVendors(page, stamp)
        const searched = await searchRequest(seen, stamp)
        await expect(vendorEntry(page, vendor('Eagle'))).toBeVisible()
        expect(searched?.searchParams.get('perPage')).toBe('51')
        expect(filterOf(searched)).toBe(`((${textFilter(stamp)}) && inactive = false)`)

        // (2) The server's order ignores case and accents.
        const order = [vendor('Eagle'), vendor('Écho'), lowerFable, vendor('Vendor 01')]
        for (const [index, name] of order.entries()) {
            await expect(vendorEntries(page).nth(index)).toContainText(name)
        }

        // (3) Only the first page is loaded until the person scrolls near the end.
        expect(seen.some(isCursor)).toBe(false)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-table-rows')
                return seen.some(isCursor)
            })
            .toBe(true)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-table-rows')
                return vendorEntry(page, vendor('Vendor 57')).count()
            })
            .toBe(1)
        await expect(vendorEntry(page, vendor('Vendor 99'))).toHaveCount(0)

        // (4) Show inactive drops the inactive filter from the request.
        await searchVendors(page, `${stamp} Vendor 99`)
        await expect(page.getByTestId('vendors-no-match')).toBeVisible()
        await page.getByTestId('vendors-show-inactive').click()
        await expect(vendorEntry(page, vendor('Vendor 99'))).toBeVisible()
        expect(seen.some(url => filterOf(url) === `(${textFilter(`${stamp} Vendor 99`)})`)).toBe(
            true
        )
        await page.getByTestId('vendors-show-inactive').click()

        // (5) `%`, `_` and `\` are not wildcards or an escape: each cuts the text into
        //     pieces that must all appear, in any order. Each term finds a different
        //     number of rows when read the other way (`otherWay`), so the count tells the
        //     two apart: as a wildcard, `_1` finds only Vendor 01, 11, 21, 31, 41 and 51,
        //     and the `%` and `\` terms find nothing.
        const cutTerms = [
            {
                term: `${stamp} Vendor _1`,
                pieces: [`${stamp} Vendor`, '1'],
                otherWay: new RegExp(`${stamp} Vendor .1`, 'i'),
            },
            {
                term: `1%${stamp} Vendor 3`,
                pieces: ['1', `${stamp} Vendor 3`],
                otherWay: new RegExp(`1.*${stamp} Vendor 3`, 'i'),
            },
            {
                term: `3\\${stamp} Vendor 1`,
                pieces: ['3', `${stamp} Vendor 1`],
                otherWay: new RegExp(`3${stamp} Vendor 1`, 'i'),
            },
        ]
        for (const { term, pieces, otherWay } of cutTerms) {
            const expected = holdingAll(activeNames, pieces)
            expect(expected.length).not.toBe(activeNames.filter(name => otherWay.test(name)).length)
            await searchVendors(page, term)
            for (const name of expected) await expect(vendorEntry(page, name)).toBeVisible()
            await expect(vendorEntries(page)).toHaveCount(expected.length)
            await expect(page.getByTestId('vendors-banner')).toHaveCount(0)
        }

        // (6) Typing a key at a time keeps the field focused while each answer loads.
        const input = page.getByTestId('vendors-search')
        await input.fill('')
        await input.pressSequentially(`${stamp} Vendor 1`)
        await expect(input).toBeFocused()
        await expect(input).toHaveValue(`${stamp} Vendor 1`)
        await expect(vendorEntries(page)).toHaveCount(10)
    })

    // A view the first page fits in gives no scroll event: the list asks for the next page
    // when the rows are measured, not only on a scroll.
    test('a view taller than the first page loads the next page without a scroll (desktop)', async ({
        page,
    }) => {
        await openBooks(page, TALL_DESKTOP)
        const seen = watchListRequests(page, 'books_vendors')
        await openVendorsList(page)
        await searchVendors(page, stamp)
        await expect(vendorEntry(page, vendor('Vendor 57'))).toBeVisible()
        expect(seen.some(isCursor)).toBe(true)
        const scrollTop = await page.getByTestId('vendors-table-rows').evaluate(el => el.scrollTop)
        expect(scrollTop).toBe(0)
    })

    // At PHONE only for vendors: the phone path renders ListCards, other scrolling code
    // than the desktop table; the customers and products cards share it.
    test('the next page loads as the cards scroll (phone)', async ({ page }) => {
        await openBooks(page, PHONE)
        const seen = watchListRequests(page, 'books_vendors')
        await openVendorsList(page)
        await searchVendors(page, stamp)
        await expect(vendorEntry(page, vendor('Eagle'))).toBeVisible()
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-cards')
                return seen.some(isCursor)
            })
            .toBe(true)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'vendors-cards')
                return vendorEntry(page, vendor('Vendor 57')).count()
            })
            .toBe(1)
    })
})

test.describe('customers list pages its tree from the server', () => {
    const stamp = runStamp()
    const seeded: Seeded[] = []
    const customer = (n: number) => `Zz Paging ${stamp} Customer ${two(n)}`
    const sub = (n: number) => `Zz Paging ${stamp} Sub ${two(n)}`

    // Customer 01 alone, customers 02 to 30 each with one sub-customer, customer 31
    // alone: 60 rows. In the tree order row 50 is customer 26, the last row of the first
    // page, and its sub-customer is the first row of the second.
    test.beforeAll(async () => {
        const pb = await superuserClient()
        const parents = new Map<number, string>()
        for (let n = 31; n >= 1; n--) {
            const row = await pb.collection('books_customers').create({ display_name: customer(n) })
            seeded.push({ collection: 'books_customers', id: row.id })
            parents.set(n, row.id)
        }
        for (let n = 30; n >= 2; n--) {
            const row = await pb
                .collection('books_customers')
                .create({ display_name: sub(n), parent: parents.get(n) })
            seeded.push({ collection: 'books_customers', id: row.id })
        }
    })

    test.afterAll(async () => {
        await deleteSeeded(await superuserClient(), seeded)
    })

    test('a page boundary keeps the tree; a matching sub-customer shows its parent (desktop)', async ({
        page,
    }) => {
        await openBooks(page, DESKTOP)
        const seen = watchListRequests(page, 'books_customers')
        await openCustomersList(page)
        await searchCustomers(page, stamp)
        const searched = await searchRequest(seen, stamp)
        await expect(customerEntry(page, customer(1))).toBeVisible()
        expect(searched?.searchParams.get('perPage')).toBe('51')
        expect(seen.some(isCursor)).toBe(false)

        await expect
            .poll(async () => {
                await scrollToEnd(page, 'customers-table-rows')
                return seen.some(isCursor)
            })
            .toBe(true)
        await scrollToRow(page, 'customers-table-rows', 45)
        const list = page.getByTestId('customers-list')
        const names = [customer(26), sub(26), customer(27)]
        await expect
            .poll(async () => {
                const tops = await Promise.all(names.map(name => textTop(list, name)))
                return tops.every((top, i) => top >= 0 && (i === 0 || top > tops[i - 1]))
            })
            .toBe(true)
        await expect
            .poll(
                async () =>
                    (await textLeft(customerEntry(page, sub(26)), sub(26))) -
                    (await textLeft(customerEntry(page, customer(26)), customer(26)))
            )
            .toBeGreaterThan(8)

        // Only the sub-customer matches; its parent shows above it, the parent's other
        // rows do not.
        await searchCustomers(page, `${stamp} Sub 30`)
        await expectEntriesInOrder(page, [customer(30), sub(30)])
    })
})

test.describe('products list pages from the server', () => {
    const stamp = runStamp()
    const seeded: Seeded[] = []
    const product = (n: number) => `Zz Paging ${stamp} Product ${two(n)}`

    test.beforeAll(async () => {
        const pb = await superuserClient()
        // 4000 Consulting Income is a seeded income account (lib/seed-accounts.ts).
        const income = await pb.collection('books_accounts').getFirstListItem('number = "4000"')
        for (let n = 60; n >= 1; n--) {
            const row = await pb
                .collection('books_products')
                .create({ type: 'service', name: product(n), income_account: income.id })
            seeded.push({ collection: 'books_products', id: row.id })
        }
    })

    test.afterAll(async () => {
        await deleteSeeded(await superuserClient(), seeded)
    })

    test('a page at a time as the table scrolls (desktop)', async ({ page }) => {
        await openBooks(page, DESKTOP)
        const seen = watchListRequests(page, 'books_products')
        await openProductsList(page)
        await searchProducts(page, stamp)
        const searched = await searchRequest(seen, stamp)
        await expect(productEntry(page, product(1))).toBeVisible()
        expect(searched?.searchParams.get('perPage')).toBe('51')
        expect(filterOf(searched)).toBe(
            `((name ~ "%${stamp}%" || sku ~ "%${stamp}%" || sales_description ~ "%${stamp}%") && inactive = false)`
        )
        expect(seen.some(isCursor)).toBe(false)
        await expect
            .poll(async () => {
                await scrollToEnd(page, 'products-table-rows')
                return productEntry(page, product(60)).count()
            })
            .toBe(1)
        expect(seen.some(isCursor)).toBe(true)
    })
})
