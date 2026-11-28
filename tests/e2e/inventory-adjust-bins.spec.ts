import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage, TEST_USER_NAME } from '@tinycld/core/e2e-helpers'
import { PHONE } from './account-register-helpers'
import { fakeReadOnlyAccess } from './banking-helpers'
import {
    binDialog,
    binEntries,
    binInserted,
    binRow,
    binsList,
    binWritten,
    chooseBinMenu,
    createBin,
    itemBinRows,
    itemPage,
    itemTab,
    makeInventoryItem,
    menuOption,
    moveStockDialog,
    openBins,
    openItem,
    openItemBins,
    openMoveStock,
    openNewBin,
    pickMoveFrom,
    pickMoveTo,
    searchBins,
    shown,
    transferInserted,
} from './inventory-adjust-helpers'
import { escapeRegExp, uniqueName } from './record-form-helpers'
import { fakeEmptyList } from './vendor-1099-helpers'

// A seeded active bin (seed.ts BINS). The reader's test only reads it.
const FRONT_COUNTER = 'Front counter'

// The Bin locations tab (inventory-adjust spec §3.7), the item page's Bins tab and the Move
// stock dialog (§3.8). Every bin and item here is made by the test with a per-run name; no
// seeded bin or item is written. The book always holds the seeded bins, so Move stock shows.
//
// Not driven here: a failed load of the edited bin (DialogLoadError with Retry). A row press
// opens a bin the list's query already filed in the store, and pbtsdb serves a read by id
// from the store with no request (servedFromStore), so no route can fail that read. The
// binDialogState cases of tests/bin-list.test.ts cover that state.
//
// Phone: the bin cards (BinCard) and the Sheet form of both dialogs are other code, so the
// third test runs at 390 × 844.

// A bin text in the server's own words: server/testdata/bin_messages.json, which the Go
// guards and lib/bin-messages.ts both follow, with each `%s` filled in order. (lib/bin-messages
// reaches React Native through its money imports, so a spec cannot import it.)
function binMessage(key: 'nameTaken' | 'inUse' | 'holds', ...parts: string[]): string {
    const file = new URL('../../server/testdata/bin_messages.json', import.meta.url)
    const texts = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
    const text = texts[key]
    if (text === undefined) throw new Error(`bin_messages.json has no ${key}`)
    let index = 0
    return text.replace(/%s/g, () => parts[index++] ?? '')
}

// The visible menu or picker options whose text starts with `name`.
function optionsNamed(page: Page, name: string): Locator {
    return page
        .locator('[role="menuitem"], [role="menuitemcheckbox"]')
        .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(name)}(?:\\s|$)`), visible: true })
}

// The rows (table) or cards of the shown Stock tab's movements. `item-move-stock` (Move
// stock) starts with the same prefix, so the rows are read inside their container only.
function movementCount(page: Page): Promise<number> {
    return shown(page, 'item-movements-table')
        .or(shown(page, 'item-movements-cards'))
        .locator('[data-testid^="item-move-"]')
        .count()
}

// Every POST of a move between bins that the page sends.
function trackTransferPosts(page: Page): string[] {
    const posts: string[] = []
    page.on('request', request => {
        const path = new URL(request.url()).pathname
        if (request.method() === 'POST' && path.includes('/books_bin_transfers/')) {
            posts.push(path)
        }
    })
    return posts
}

// The top and left of a shown element's box, or null while it is not laid out.
async function boxOf(page: Page, testId: string) {
    const box = await shown(page, testId).boundingBox()
    return box ? { top: box.y, left: box.x } : null
}

test.describe('inventory-adjust: bins', () => {
    test('a bookkeeper adds, edits, hides, finds and deletes bin locations', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const stem = uniqueName('E2E Bin list')
        const main = `${stem} Main`
        const spare = `${stem} Spare`

        // Products and services, then the tab Bin locations.
        await openBins(page)

        // New bin location: focus in Name, typed from the keyboard, saved by the submit key.
        // Inactive is an edit field only (spec §3.7), so a new bin has none.
        await openNewBin(page)
        await expect(page.getByTestId('bin-inactive')).toHaveCount(0)
        await page.keyboard.type(main)
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('bin-note')).toBeFocused()
        await page.keyboard.type('Top shelf by the door')
        const created = binInserted(page)
        await page.keyboard.press('ControlOrMeta+Enter')
        expect((await created).status()).toBe(200)
        await expect(binDialog(page)).toHaveCount(0)
        await searchBins(page, main)
        await expect(binRow(page, main)).toContainText('Top shelf by the door')

        // The same name in other letters is refused on Name, and the dialog stays.
        await openNewBin(page)
        await page.keyboard.type(main.toUpperCase())
        const refused = binInserted(page)
        await page.keyboard.press('ControlOrMeta+Enter')
        expect((await refused).status()).toBeGreaterThanOrEqual(400)
        await expect(binDialog(page)).toBeVisible()
        // The server's words, with the name as typed, under Name (the field's own error
        // line), and once only: the form's summary holds root refusals, not this one.
        const taken = binMessage('nameTaken', main.toUpperCase())
        const nameField = page.getByTestId('bin-name').locator('xpath=../..')
        await expect(nameField.getByText(taken, { exact: true })).toBeVisible()
        await expect(binDialog(page).getByText(taken, { exact: true })).toHaveCount(1)
        await expect(page.getByTestId('bin-form-errors').getByText(taken)).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(binDialog(page)).toHaveCount(0)

        // A row press opens the bin; from the keyboard, a new note saves and the row shows it.
        await binRow(page, main).getByText(main, { exact: true }).click()
        await expect(binDialog(page)).toBeVisible()
        await expect(page.getByTestId('bin-name')).toBeFocused()
        await expect(page.getByTestId('bin-name')).toHaveValue(main)
        await expect(shown(page, 'bin-inactive')).toBeVisible()
        await page.keyboard.press('Tab')
        await expect(page.getByTestId('bin-note')).toBeFocused()
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.type('Second shelf by the door')
        await expect(page.getByTestId('bin-note')).toHaveValue('Second shelf by the door')
        const edited = binWritten(page, 'PATCH')
        await page.keyboard.press('ControlOrMeta+Enter')
        expect((await edited).status()).toBe(200)
        await expect(binDialog(page)).toHaveCount(0)
        await expect(binRow(page, main)).toContainText('Second shelf by the door')

        // Make inactive: the row leaves the list; Show inactive brings it back, marked.
        const hidden = binWritten(page, 'PATCH')
        await chooseBinMenu(page, main, 'Make inactive')
        expect((await hidden).status()).toBe(200)
        await expect(binRow(page, main)).toHaveCount(0)
        const showInactive = shown(page, 'bins-show-inactive')
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'true')
        await expect(binRow(page, main).getByText('Inactive', { exact: true })).toBeVisible()
        const shownAgain = binWritten(page, 'PATCH')
        await chooseBinMenu(page, main, 'Make active')
        expect((await shownAgain).status()).toBe(200)
        await expect(binRow(page, main).getByText('Inactive', { exact: true })).toHaveCount(0)
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'false')
        await expect(binRow(page, main)).toHaveCount(1)

        // Search by a part of a name keeps that row only.
        await createBin(page, spare)
        await searchBins(page, stem)
        await expect(binEntries(page)).toHaveCount(2)
        await searchBins(page, `${stem.slice(-6)} Ma`)
        await expect(binRow(page, main)).toHaveCount(1)
        await expect(binEntries(page)).toHaveCount(1)

        // Delete of a bin that nothing names: the row is gone.
        await searchBins(page, spare)
        await chooseBinMenu(page, spare, 'Delete')
        const dialog = shown(page, 'bin-delete-dialog')
        await expect(dialog).toBeVisible()
        const deleted = binWritten(page, 'DELETE')
        await dialog.getByRole('button', { name: /^Delete/ }).click()
        expect((await deleted).status()).toBe(204)
        await expect(dialog).toHaveCount(0)
        await expect(binRow(page, spare)).toHaveCount(0)
        await searchBins(page, stem)
        await expect(binRow(page, main)).toHaveCount(1)
        await expect(binEntries(page)).toHaveCount(1)
    })

    test('stock moves between bins, with no change to the figures or the stock moves', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const stem = uniqueName('E2E Move bin')
        const binA = `${stem} A`
        const binB = `${stem} B`
        const name = uniqueName('E2E Move item')
        const memo = `Counter stock ${stem}`
        await createBin(page, binA)
        await createBin(page, binB)
        await makeInventoryItem(page, { name, quantity: '12', value: '60.00', bin: binA })

        // A holds the item's stock, so its delete is refused with the server's text.
        await openBins(page)
        await searchBins(page, binA)
        await chooseBinMenu(page, binA, 'Delete')
        const deleteDialog = shown(page, 'bin-delete-dialog')
        await expect(deleteDialog).toBeVisible()
        const refusedDelete = binWritten(page, 'DELETE')
        await deleteDialog.getByRole('button', { name: /^Delete/ }).click()
        expect((await refusedDelete).status()).toBeGreaterThanOrEqual(400)
        await expect(deleteDialog).toContainText(binMessage('inUse', binA))
        await expect(deleteDialog.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(deleteDialog).toHaveCount(0)
        await expect(binRow(page, binA)).toHaveCount(1)

        // ⌥2: one row, A with 12 and the mark Default.
        await openItem(page, name)
        await openItemBins(page, 'key')
        await expect.poll(() => itemBinRows(page)).toEqual([`${binA} Default 12`])

        // M: Move stock. From lists A with what it holds; To does not offer A.
        const posts = trackTransferPosts(page)
        await page.keyboard.press('m')
        await expect(moveStockDialog(page)).toBeVisible()
        // A data-entry dialog opens with the focus in its first field (lesson 16).
        await expect(moveStockDialog(page).getByTestId('move-stock-from')).toBeFocused()
        await pickMoveFrom(page, `${binA} · 12`)
        await page.getByTestId('move-stock-to').click()
        await page.getByTestId('move-stock-to-search').fill(stem)
        await expect(optionsNamed(page, binB)).toHaveCount(1)
        await expect(optionsNamed(page, binA)).toHaveCount(0)
        await menuOption(page, binB).click()
        await expect(page.getByTestId('move-stock-to')).toContainText(binB)

        // 13 is more than A holds: the server's words, and nothing is sent.
        await page.getByTestId('move-stock-quantity').fill('13')
        await page.getByTestId('move-stock-memo').fill(memo)
        await page.keyboard.press('ControlOrMeta+Enter')
        await expect(
            moveStockDialog(page).getByText(binMessage('holds', binA, '12', '12'), {
                exact: true,
            })
        ).toBeVisible()
        expect(posts).toEqual([])

        // 4 saves.
        await page.getByTestId('move-stock-quantity').fill('4')
        const moved = transferInserted(page)
        await page.keyboard.press('ControlOrMeta+Enter')
        expect((await moved).status()).toBe(200)
        await expect(moveStockDialog(page)).toHaveCount(0)
        expect(posts).toHaveLength(1)

        // The tab shows A 8 and B 4, and Recent moves names the move and the user.
        await expect
            .poll(async () => (await itemBinRows(page)).sort())
            .toEqual([`${binA} Default 8`, `${binB} 4`].sort())
        const transfers = shown(page, 'item-transfers').locator('[data-testid^="item-transfer-"]')
        await expect(transfers).toHaveCount(1)
        await expect(transfers.first()).toHaveText(
            new RegExp(
                ` · 4 from ${escapeRegExp(binA)} to ${escapeRegExp(binB)} · ${escapeRegExp(TEST_USER_NAME)}$`
            )
        )

        // To never holds the From bin (spec §3.8): with To B, a change of From to B clears To.
        await openMoveStock(page)
        await expect(page.getByTestId('move-stock-from')).toContainText(`${binA} · 8`)
        await pickMoveTo(page, binB)
        await pickMoveFrom(page, `${binB} · 4`)
        await expect(page.getByTestId('move-stock-from')).toContainText(`${binB} · 4`)
        await expect(page.getByTestId('move-stock-to')).not.toContainText(binB)
        await page.keyboard.press('Escape')
        await expect(moveStockDialog(page)).toHaveCount(0)

        // The move changes no figure and adds no stock move.
        await expect(shown(page, 'item-figure-on-hand')).toHaveText('12')
        await expect(shown(page, 'item-figure-stock-value')).toHaveText('$60.00')
        await page.keyboard.press('Alt+1')
        await expect(itemTab(page, 'Stock')).toHaveAttribute('aria-selected', 'true')
        await expect.poll(() => movementCount(page)).toBe(1)

        // A made inactive keeps its stock on the item page, with "(inactive)".
        await openBins(page)
        await searchBins(page, binA)
        const inactive = binWritten(page, 'PATCH')
        await chooseBinMenu(page, binA, 'Make inactive')
        expect((await inactive).status()).toBe(200)
        await expect(binRow(page, binA)).toHaveCount(0)

        await openItem(page, name)
        await openItemBins(page, 'key')
        await expect
            .poll(async () => (await itemBinRows(page)).find(row => row.startsWith(binA)))
            .toMatch(new RegExp(`^${escapeRegExp(binA)} \\(inactive\\) Default 8$`))

        // From still offers A; with B as From, To offers neither A (inactive) nor B.
        await openMoveStock(page)
        await page.getByTestId('move-stock-from').click()
        await expect(optionsNamed(page, binA)).toHaveCount(1)
        await expect(optionsNamed(page, binA)).toHaveText(
            new RegExp(`^${escapeRegExp(binA)} \\(inactive\\) · 8$`)
        )
        await menuOption(page, `${binB} · 4`).click()
        await page.getByTestId('move-stock-to').click()
        await page.getByTestId('move-stock-to-search').fill(stem)
        await expect(menuOption(page, 'No bin')).toBeVisible()
        await expect(optionsNamed(page, binA)).toHaveCount(0)
        await expect(optionsNamed(page, binB)).toHaveCount(0)
    })

    test('on a phone the bins are cards and both dialogs are sheets', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const stem = uniqueName('E2E Phone bin')
        const home = `${stem} Home`
        const counter = `${stem} Counter`
        const name = uniqueName('E2E Phone move item')
        await createBin(page, home)
        await makeInventoryItem(page, { name, quantity: '5', value: '25.00', bin: home })

        await page.setViewportSize(PHONE)
        await openBins(page)
        await expect(shown(page, 'bins-cards')).toBeVisible()
        await expect(shown(page, 'bins-table')).toHaveCount(0)

        // New bin location opens a sheet; save shows the card.
        await openNewBin(page)
        await page.keyboard.type(counter)
        const created = binInserted(page)
        await binDialog(page).getByRole('button', { name: /^Save/ }).click()
        expect((await created).status()).toBe(200)
        await expect(binDialog(page)).toHaveCount(0)
        await searchBins(page, counter)
        await expect(binRow(page, counter)).toHaveCount(1)

        // The item's More offers Move stock; the sheet's fields stack.
        await openItem(page, name)
        await openMoveStock(page)
        // The sheet, opened from the phone's More row, starts with the focus in From too.
        await expect(moveStockDialog(page).getByTestId('move-stock-from')).toBeFocused()
        await expect
            .poll(async () => {
                const boxes = await Promise.all(
                    [
                        'move-stock-from',
                        'move-stock-to',
                        'move-stock-quantity',
                        'move-stock-memo',
                    ].map(id => boxOf(page, id))
                )
                if (boxes.some(box => box === null)) return null
                const laid = boxes.filter(box => box !== null)
                const first = laid[0]
                if (!first) return null
                return {
                    eachBelow: laid.every((box, i) => i === 0 || box.top > (laid[i - 1]?.top ?? 0)),
                    sameLeft: laid.every(box => Math.abs(box.left - first.left) <= 1),
                }
            })
            .toEqual({ eachBelow: true, sameLeft: true })

        // A move of 1 saves, and the Bins tab shows it.
        await pickMoveFrom(page, `${home} · 5`)
        await pickMoveTo(page, counter)
        await page.getByTestId('move-stock-quantity').fill('1')
        const moved = transferInserted(page)
        await moveStockDialog(page)
            .getByRole('button', { name: /^Move stock/ })
            .click()
        expect((await moved).status()).toBe(200)
        await expect(moveStockDialog(page)).toHaveCount(0)
        await openItemBins(page, 'press')
        await expect(itemPage(page)).toBeVisible()
        await expect
            .poll(async () => (await itemBinRows(page)).sort())
            .toEqual([`${home} Default 4`, `${counter} 1`].sort())
    })

    test('a move of stock in No bin does not offer No bin as To', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const name = uniqueName('E2E No bin item')
        // No default bin: the opening stock is in No bin.
        await makeInventoryItem(page, { name, quantity: '3', value: '15.00' })
        await openItem(page, name)
        await openMoveStock(page)
        await expect(page.getByTestId('move-stock-from')).toContainText('No bin · 3')
        // To is the active bins and No bin, not the From bin (spec §3.8).
        await expect(page.getByTestId('move-stock-to')).not.toContainText('No bin')
    })

    test('a reader opens no bin dialog from a row or a card', async ({ page }) => {
        // A faked read only (lesson 14): the seed has no read-only Books member.
        await fakeReadOnlyAccess(page)
        await login(page)
        await navigateToPackage(page, 'books')
        await openBins(page)
        await expect(
            binsList(page).getByRole('button', { name: 'New bin location', exact: true })
        ).toHaveCount(0)

        // The row already shows the name and the note; a press opens nothing.
        await searchBins(page, FRONT_COUNTER)
        await binRow(page, FRONT_COUNTER).getByText(FRONT_COUNTER, { exact: true }).click()
        await expect(binDialog(page)).toHaveCount(0)
        await expect(page.getByTestId('bin-name')).toHaveCount(0)

        // The phone's card (BinCard) is other code: its press opens nothing too.
        await page.setViewportSize(PHONE)
        await expect(shown(page, 'bins-cards')).toBeVisible()
        await searchBins(page, FRONT_COUNTER)
        await binRow(page, FRONT_COUNTER).getByText(FRONT_COUNTER, { exact: true }).click()
        await expect(binDialog(page)).toHaveCount(0)
        await expect(page.getByTestId('bin-name')).toHaveCount(0)
    })

    test('the empty bin list keeps its search and Show inactive', async ({ page }) => {
        // Every bin read answers no rows, as in a book whose bins are all inactive while
        // Show inactive is off; realtime is cut so no other worker's bin refills it (lesson 1).
        await fakeEmptyList(page, 'books_bins')
        await login(page)
        await navigateToPackage(page, 'books')
        await openBins(page)
        await expect(shown(page, 'bins-empty')).toBeVisible()
        // Show inactive must stay reachable, or the inactive bins (and their stock) are lost
        // to the user (spec §3.7).
        const showInactive = shown(page, 'bins-show-inactive')
        await expect(showInactive).toBeVisible()
        await expect(shown(page, 'bins-search')).toBeVisible()
        await showInactive.click()
        await expect(showInactive).toHaveAttribute('aria-checked', 'true')
    })
})
