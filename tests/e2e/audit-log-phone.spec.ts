import { expect, type Page, test } from '@playwright/test'
import {
    chooseParamOption,
    login,
    navigateToPackage,
    waitForTableFit,
} from '@tinycld/core/e2e-helpers'
import { openAuditLog, openHistoryFromRow, waitForAuditRow } from './audit-log-helpers'
import { openOtherBooksPage } from './journal-entries-helpers'
import {
    createProduct,
    expectSavedToList,
    field,
    openProduct,
    uniqueName,
} from './products-services-helpers'

// What is wrong with the newest history event's field cards, read in ONE pass; empty when
// each card shows its label, then Before, then After, one under the other, and nothing
// scrolls sideways. `texts` is [label, before, after] of the one changed field.
function fieldCardProblems(page: Page, texts: [string, string, string]): Promise<string[]> {
    return page.evaluate(([label, before, after]) => {
        const problems: string[] = []
        const screen = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="history-screen"]'),
        ].find(element => element.offsetParent !== null)
        if (!screen) return ['no visible history-screen']
        const event = screen.querySelector('[data-testid^="history-event-"]')
        if (!event) return ['no history event']
        const leaves = (text: string) =>
            [...event.querySelectorAll<HTMLElement>('*')].filter(
                element => element.children.length === 0 && element.innerText.trim() === text
            )
        const tops: number[] = []
        for (const text of [label, before, after]) {
            const found = leaves(text)
            if (found.length !== 1) problems.push(`${found.length} cells read "${text}"`)
            else tops.push(found[0]?.getBoundingClientRect().top ?? 0)
        }
        if (tops.length === 3 && !(tops[0] < tops[1] && tops[1] < tops[2])) {
            problems.push(`label, Before and After are not one under the other (tops ${tops})`)
        }
        const root = document.documentElement
        if (root.scrollWidth > root.clientWidth) {
            problems.push(`the page scrolls sideways (${root.scrollWidth} > ${root.clientWidth})`)
        }
        if (screen.scrollWidth > screen.clientWidth) {
            problems.push(
                `the history scrolls sideways (${screen.scrollWidth} > ${screen.clientWidth})`
            )
        }
        return problems
    }, texts)
}

// The Audit Log at phone widths runs core's `mobile` row layout (Books' display), other
// code than the desktop row: each row wraps to Date changed · Event, then User · Record
// type · Record, with no sideways scroll, and Customize stays a toolbar button. The
// product's name is one long unbroken word, so the Record column meets a word wider than
// its line; it breaks the word (overflowWrap "anywhere") and the rows keep two lines.

// What is wrong with the row's two lines and the table's width, read in ONE pass; empty
// when the row wraps as the spec draws it.
function phoneRowProblems(page: Page, id: string): Promise<string[]> {
    return page.evaluate(rowId => {
        const problems: string[] = []
        const table = document.querySelector<HTMLElement>('[data-testid="report-table"]')
        if (!table) return ['no report-table']
        if (table.scrollWidth !== table.clientWidth) {
            problems.push(
                `the table scrolls sideways (${table.scrollWidth} > ${table.clientWidth})`
            )
        }
        const row = table.querySelector(`[data-testid="report-row-${rowId}"]`)
        if (!row) return [...problems, `no row ${rowId}`]
        const box = (column: string) =>
            table
                .querySelector(`[data-testid="report-cell-${column}-${rowId}"]`)
                ?.getBoundingClientRect()
        const date = row.getBoundingClientRect()
        const event = box('event')
        const line2 = { user: box('user'), type: box('type'), record: box('record') }
        if (!event) return [...problems, 'no Event cell']
        if (Math.abs(event.top - date.top) > 1) {
            problems.push(
                `Date changed (top ${date.top}) and Event (top ${event.top}) are not on line 1`
            )
        }
        const tops: number[] = []
        for (const [column, rect] of Object.entries(line2)) {
            if (!rect) problems.push(`no ${column} cell`)
            else tops.push(rect.top)
        }
        if (tops.length === 3 && Math.max(...tops) - Math.min(...tops) > 1) {
            problems.push(`User, Record type and Record are not on one line (tops ${tops})`)
        }
        const line1Bottom = Math.max(date.bottom, event.bottom)
        if (tops.length > 0 && Math.min(...tops) < line1Bottom - 1) {
            problems.push(
                `line 2 (top ${Math.min(...tops)}) is not below line 1 (bottom ${line1Bottom})`
            )
        }
        return problems
    }, id)
}

// Opens the Audit Log on a page already at a phone width, finds the product's row and
// checks the phone layout core chose, the row's two lines and the Customize button.
async function expectPhoneRows(page: Page, name: string) {
    const width = page.viewportSize()?.width
    await expect(page.getByTestId('mobile-drawer-panel')).toBeAttached()
    await openAuditLog(page)
    // The table mounts the newest rows first. Other workers' changes made after the
    // product's can push its row past them, so only products are shown.
    await chooseParamOption(page, 'types', {
        from: 'add-filter',
        labels: ['Product or service'],
    })
    const row = await waitForAuditRow(page, { record: name, event: 'Added' })
    expect(await waitForTableFit(page), `the layout core chose at ${width}`).toBe('mobile')
    await expect
        .poll(() => phoneRowProblems(page, row.id), { message: `the phone row at ${width}` })
        .toEqual([])
    // Core's toolbar folds into More only what does not fit; Customize fits at 390 and 375.
    await expect(page.getByTestId('report-customize-open')).toBeVisible()
}

test.describe('audit-log: phone', () => {
    test.use({ timezoneId: 'America/Chicago' })

    test('rows with a long unbroken Record wrap to two lines with no sideways scroll at 390 and 375', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        // A change of this test's own, so the report has a row this month whose Record is
        // one word of about 25 letters and digits, wider than the Record column's line.
        const name = `AuditPhone${uniqueName('').replace(/\D/g, '')}`
        await createProduct(page, { type: 'service', name })

        await page.setViewportSize({ width: 390, height: 844 })
        await expectPhoneRows(page, name)

        // 375 in a page that loads the report at that width, not one resized under it.
        const fresh = await openOtherBooksPage(page)
        await fresh.setViewportSize({ width: 375, height: 812 })
        await expectPhoneRows(fresh, name)
        await fresh.close()
    })

    // The phone history draws each changed field as a card, other code than the table.
    test('a tapped row opens the history screen with one card per changed field', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const name = uniqueName('Audit phone card')
        const renamed = `${name} renamed`
        await createProduct(page, { type: 'service', name })
        await openProduct(page, name)
        await field(page, 'name').fill(renamed)
        await page.getByTestId('product-save').click()
        await expectSavedToList(page)

        await page.setViewportSize({ width: 390, height: 844 })
        await expect(page.getByTestId('mobile-drawer-panel')).toBeAttached()
        await openAuditLog(page)
        // The history opens as its own screen with its back link, not in a panel.
        await openHistoryFromRow(page, { record: renamed, event: 'Changed' })
        await expect(page.getByTestId('history-back').filter({ visible: true })).toBeVisible()
        await expect
            .poll(() => fieldCardProblems(page, ['Name', name, renamed]), {
                message: 'the Name card at 390',
            })
            .toEqual([])
    })
})
