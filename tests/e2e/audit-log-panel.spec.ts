import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage, pressToolbar } from '@tinycld/core/e2e-helpers'
import { AUDIT_LOG_TITLE } from '~/tinycld/books/lib/audit-log-fixture'
import { openAuditLog, waitForAuditRow } from './audit-log-helpers'
import { createProduct, productIdOf, searchProducts, uniqueName } from './products-services-helpers'

// Record history in core's side panel beside the Audit Log (spec §3 Record history, core
// D5): at 1360 px and wider a row press opens the record's history in the 480 px panel;
// below it the panel is a page over the report (B3) and a press pushes the history screen.
// Every product is created through the UI with a unique name. The row mark is asserted
// only after a press, never after a reload (B2).

const NARROW = { width: 1280, height: 900 }

function recordPanel(page: Page) {
    return page.getByTestId('report-record-panel')
}

function panelTitle(page: Page) {
    return recordPanel(page).getByTestId('report-record-panel-title')
}

function markedRows(page: Page) {
    return page.locator('[data-testid^="report-row-d:"][aria-selected="true"]')
}

function param(page: Page, key: string): string | null {
    return new URL(page.url()).searchParams.get(key)
}

function historyScreen(page: Page) {
    return page.getByTestId('history-screen').filter({ visible: true })
}

// A Service product made through the form, with its record id from the list.
async function newProduct(page: Page, prefix: string): Promise<{ name: string; id: string }> {
    const name = uniqueName(prefix)
    await createProduct(page, { type: 'service', name })
    await searchProducts(page, name)
    return { name, id: await productIdOf(page, name) }
}

// The product's Added row's label (its Date changed link), once the report lists it.
async function addedRowLink(page: Page, name: string) {
    const row = await waitForAuditRow(page, { record: name, event: 'Added' })
    return page.getByTestId(`report-row-${row.id}`)
}

// The panel's width and whether it sits right of the report table, read in one pass.
async function panelPlacement(page: Page) {
    const panel = await recordPanel(page).boundingBox()
    const table = await page.getByTestId('report-table').boundingBox()
    if (!panel || !table) return { width: 0, beside: false }
    return { width: Math.round(panel.width), beside: panel.x >= table.x + table.width - 1 }
}

// What is wrong with the report beside the open panel, read in ONE pass; empty when the
// table does not scroll sideways and its first detail row takes the tablet layout (P4):
// Date changed, User, Event and Record type on line 1, Record on line 2.
function tabletRowProblems(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const problems: string[] = []
        const table = document.querySelector<HTMLElement>('[data-testid="report-table"]')
        if (!table) return ['no report-table']
        if (table.scrollWidth > table.clientWidth) {
            problems.push(
                `the table scrolls sideways (${table.scrollWidth} > ${table.clientWidth})`
            )
        }
        const first = [...table.querySelectorAll('[data-testid^="report-row-d:"]')]
            .map(element => ({ element, top: element.getBoundingClientRect().top }))
            .sort((a, b) => a.top - b.top)[0]
        if (!first) return [...problems, 'no detail row']
        const rowId = (first.element.getAttribute('data-testid') ?? '').slice('report-row-'.length)
        const box = (testId: string) =>
            table.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect()
        const cell = (column: string) => box(`report-cell-${column}-${rowId}`)
        // Core gives the label column (Date changed, the row's link) the id
        // `report-row-<row id>` (RowLabel); the other columns are `report-cell-<column>-<row id>`.
        const date = box(`report-row-${rowId}`)
        if (!date) return [...problems, 'no Date changed cell']
        if (date.width >= table.clientWidth - 1) {
            problems.push(`the Date changed cell spans the row (${date.width} px)`)
        }
        const line1 = { user: cell('user'), event: cell('event'), type: cell('type') }
        const record = cell('record')
        let line1Bottom = date.bottom
        for (const [column, rect] of Object.entries(line1)) {
            if (!rect) {
                problems.push(`no ${column} cell`)
                continue
            }
            if (Math.abs(rect.top - date.top) > 1) {
                problems.push(`${column} (top ${rect.top}) is not on line 1 (top ${date.top})`)
            }
            line1Bottom = Math.max(line1Bottom, rect.bottom)
        }
        if (!record) return [...problems, 'no record cell']
        if (record.top < line1Bottom - 1) {
            problems.push(`Record (top ${record.top}) is not below line 1 (bottom ${line1Bottom})`)
        }
        return problems
    })
}

test.describe('audit-log: history panel', () => {
    test.use({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Chicago' })

    test('a row opens its history in the panel; another row replaces it; ✕, Escape and Customize close it', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const first = await newProduct(page, 'Audit panel first')
        const second = await newProduct(page, 'Audit panel second')

        await openAuditLog(page)
        const firstRow = await addedRowLink(page, first.name)
        const secondRow = await addedRowLink(page, second.name)

        // The press opens the history beside the report, 480 px wide, named by the record.
        await firstRow.click()
        await expect(recordPanel(page)).toBeVisible()
        await expect.poll(() => panelPlacement(page)).toEqual({ width: 480, beside: true })
        await expect(panelTitle(page)).toHaveText(first.name)
        expect(param(page, 'dr')).toBe(`books/history/books_products/${first.id}`)
        await expect(firstRow).toHaveAttribute('aria-selected', 'true')
        await expect(markedRows(page)).toHaveCount(1)

        // The report beside the panel keeps its tablet layout, with no sideways scroll.
        await expect
            .poll(() => tabletRowProblems(page), { message: 'the report beside the panel' })
            .toEqual([])

        // Another row replaces the history; only that row is marked.
        await secondRow.click()
        await expect(panelTitle(page)).toHaveText(second.name)
        await expect.poll(() => param(page, 'dr')).toBe(`books/history/books_products/${second.id}`)
        await expect(secondRow).toHaveAttribute('aria-selected', 'true')
        await expect(markedRows(page)).toHaveCount(1)

        // ✕ closes it.
        await recordPanel(page).getByTestId('report-record-panel-close').click()
        await expect(recordPanel(page)).toHaveCount(0)
        await expect.poll(() => param(page, 'dr')).toBeNull()

        // Escape closes it too.
        await secondRow.click()
        await expect(panelTitle(page)).toHaveText(second.name)
        await page.keyboard.press('Escape')
        await expect(recordPanel(page)).toHaveCount(0)
        await expect.poll(() => param(page, 'dr')).toBeNull()

        // One side surface at a time: Customize closes the panel (B7).
        await secondRow.click()
        await expect(panelTitle(page)).toHaveText(second.name)
        await pressToolbar(page, 'report-customize-open', 'Customize')
        await expect(page.getByTestId('report-customize')).toBeVisible()
        await expect(recordPanel(page)).toHaveCount(0)
        await expect.poll(() => param(page, 'dr')).toBeNull()
        await page.getByTestId('report-customize-close').click()
        await expect(page.getByTestId('report-customize')).toHaveCount(0)
    })

    test('Open as full screen pushes the history, and below 1360 px the panel is a page and a row opens the screen', async ({
        page,
    }) => {
        await login(page)
        await navigateToPackage(page, 'books')
        const product = await newProduct(page, 'Audit panel full')
        const historyPath = new RegExp(`/books/history/books_products/${product.id}$`)

        await openAuditLog(page)
        const row = await addedRowLink(page, product.name)
        await row.click()
        await expect(panelTitle(page)).toHaveText(product.name)

        // Open as full screen pushes the history as its own screen, with its back link.
        await recordPanel(page).getByTestId('report-record-panel-full').click()
        await expect(historyScreen(page)).toBeVisible()
        await expect.poll(() => new URL(page.url()).pathname).toMatch(historyPath)
        await expect(page.getByTestId('history-back').filter({ visible: true })).toBeVisible()

        // Back returns to the report, with the panel still open.
        await page.getByTestId('history-back').filter({ visible: true }).click()
        await expect(recordPanel(page)).toBeVisible()
        await expect(panelTitle(page)).toHaveText(product.name)
        await expect
            .poll(() => param(page, 'dr'))
            .toBe(`books/history/books_products/${product.id}`)

        // Below 1360 px the open record covers the report as a page (B3): a back link named
        // by the report's title, and no ✕.
        await page.setViewportSize(NARROW)
        const back = recordPanel(page).getByTestId('report-record-panel-back')
        await expect(back).toBeVisible()
        await expect(back).toContainText(AUDIT_LOG_TITLE)
        await expect(recordPanel(page).getByTestId('report-record-panel-close')).toHaveCount(0)

        await back.click()
        await expect(recordPanel(page)).toHaveCount(0)
        await expect.poll(() => param(page, 'dr')).toBeNull()
        await expect(page.getByTestId('report-table')).toBeVisible()

        // At this width a row press pushes the history as a screen, never the panel.
        await row.click()
        await expect(historyScreen(page)).toBeVisible()
        await expect.poll(() => new URL(page.url()).pathname).toMatch(historyPath)
        await expect(recordPanel(page)).toHaveCount(0)

        await page.getByTestId('history-back').filter({ visible: true }).click()
        await expect(
            page.getByTestId('report-document-title').filter({ visible: true })
        ).toHaveText(AUDIT_LOG_TITLE)
        await expect(page).toHaveURL(/\/reports\//)
        await expect(historyScreen(page)).toHaveCount(0)
    })
})
